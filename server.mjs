#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// Load .env
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    try {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const apiKey = process.env.MERCURY_API_KEY || process.env.INCEPTION_API_KEY || "";
const baseUrl = (process.env.MERCURY_BASE_URL || "https://api.inceptionlabs.ai/v1").replace(/\/$/, "");

// SSE client management
const sseClients = new Set();
let latestScreenshotBuffer = null;

function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Global browser session
let browser = null;
let currentContext = null;
let currentPage = null;
let isTaskRunning = false;
let shouldStopTask = false;

// Scan interactive elements with index badges
async function getInteractiveElements(page) {
  try {
    return await page.evaluate(() => {
      document.querySelectorAll(".__agent_badge").forEach((b) => b.remove());
      const elements = [];
      const candidates = document.querySelectorAll(
        'button, a, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [tabindex]:not([tabindex="-1"])'
      );

      let idx = 1;
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= -100 &&
          rect.top <= window.innerHeight + 100 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        ) {
          el.setAttribute("data-agent-idx", String(idx));

          let label = (
            el.innerText ||
            el.getAttribute("placeholder") ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.getAttribute("value") ||
            el.getAttribute("name") ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 45);

          const tagName = el.tagName.toLowerCase();
          const type = el.getAttribute("type") || "";

          elements.push({
            index: idx,
            tag: tagName,
            type: type || undefined,
            label: label || `[${tagName}]`,
          });

          // Draw small visual badge
          const badge = document.createElement("span");
          badge.className = "__agent_badge";
          badge.textContent = String(idx);
          badge.style.cssText = `
            position: absolute;
            background: #e11d48;
            color: #ffffff;
            font-size: 11px;
            font-weight: bold;
            padding: 1px 4px;
            border-radius: 4px;
            z-index: 2147483647;
            pointer-events: none;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
            top: ${window.scrollY + rect.top}px;
            left: ${window.scrollX + rect.left}px;
          `;
          document.body.appendChild(badge);

          idx++;
          if (idx > 40) break;
        }
      }
      return elements;
    });
  } catch {
    return [];
  }
}

// Optimized screenshot capture
async function updateScreenshot() {
  if (!currentPage || currentPage.isClosed()) return;
  try {
    latestScreenshotBuffer = await currentPage.screenshot({ type: "jpeg", quality: 65 });
    broadcastEvent("screen_updated", {
      url: currentPage.url(),
      title: await currentPage.title().catch(() => ""),
      timestamp: Date.now(),
    });
  } catch {}
}

// General-Purpose Tool Suite
const GENERAL_TOOLS = [
  {
    name: "goto",
    description: "Navigate directly to any website URL",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Target website URL" } },
      required: ["url"],
    },
  },
  {
    name: "click",
    description: "Click an interactive element by its [index] or text",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number", description: "The index number [1..40] of the element to click" },
        text: { type: "string", description: "Alternatively, the exact visible text to click" },
      },
    },
  },
  {
    name: "type",
    description: "Fill or type text into an input or textarea field",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number", description: "The index number [1..40] of the input field" },
        text: { type: "string", description: "The text message or search term to type" },
        press_enter: { type: "boolean", description: "Whether to press Enter after typing" },
      },
      required: ["text"],
    },
  },
  {
    name: "press_key",
    description: "Press a keyboard key (e.g. Enter, Tab, Escape, ArrowDown, Backspace)",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key name to press" },
      },
      required: ["key"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the page up or down",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["down", "up"], description: "Scroll direction" },
        amount: { type: "number", description: "Pixels to scroll (default 400)" },
      },
    },
  },
  {
    name: "wait",
    description: "Wait for seconds (for page loading, messages to send, or animations)",
    parameters: {
      type: "object",
      properties: {
        seconds: { type: "number", description: "Seconds to wait (1 to 5)" },
      },
      required: ["seconds"],
    },
  },
  {
    name: "finish",
    description: "Conclude the user task with a comprehensive answer or confirmation",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Detailed response and report of what was achieved" },
      },
      required: ["summary"],
    },
  },
];

async function callMercuryAgent({ task, history, pageInfo, elements }) {
  const elementsFormatted = elements.map((e) => `[${e.index}] <${e.tag}${e.type ? ` type="${e.type}"` : ""}> "${e.label}"`).join("\n");

  const prompt = `You are Mercury 2.5, an advanced autonomous web agent operating a live browser.
You can execute ANY simple or complex web task: searching, sending messages, filling forms, purchasing, navigating, extracting info.

USER GOAL:
${task}

CURRENT BROWSER STATE:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}

INTERACTIVE ELEMENTS CURRENTLY VISIBLE ON PAGE:
${elementsFormatted || "No interactive elements detected yet."}

ACTION HISTORY:
${
  history.length
    ? history.map((h, i) => `${i + 1}. [${h.tool}] Args: ${JSON.stringify(h.args)} -> ${JSON.stringify(h.result).slice(0, 160)}`).join("\n")
    : "No actions taken yet."
}

AVAILABLE TOOLS:
${JSON.stringify(GENERAL_TOOLS, null, 2)}

DECISION RULES:
1. Examine the goal and history.
2. If starting and URL is blank or wrong, use 'goto'.
3. To interact with an element from the list, prefer using its 'index' number (e.g. click index 2, type into index 1).
4. If an input needs submission, set press_enter: true or click the submit/send button in the next step.
5. Once the goal is completed, call 'finish' with the final summary.

OUTPUT FORMAT:
Respond with STRICT JSON ONLY:
{
  "thought": "<brief step-by-step reasoning in Arabic or English>",
  "tool": "<tool_name>",
  "args": { ... }
}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MERCURY_MODEL || "mercury-2.5",
      messages: [
        { role: "system", content: "You are Mercury 2.5, an autonomous browser agent. Output valid JSON only." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mercury API error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content || "{}";

  let parsed;
  try {
    const matched = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(matched ? matched[0] : raw);
  } catch {
    parsed = { thought: "Navigating", tool: "goto", args: { url: "https://www.google.com" } };
  }

  return {
    thought: parsed.thought || "",
    tool: parsed.tool || "goto",
    args: parsed.args || {},
    tokens: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
  };
}

async function ensureBrowser(showWindow = true) {
  if (!browser) {
    browser = await chromium.launch({
      headless: !showWindow,
      args: ["--start-maximized", "--window-position=50,50"],
    });
  }
  if (!currentContext) {
    currentContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
  }
  if (!currentPage || currentPage.isClosed()) {
    currentPage = await currentContext.newPage();
  }
  return currentPage;
}

async function runAutonomousTask(task, showWindow = true) {
  if (isTaskRunning) {
    throw new Error("يوجد مهمة قيد التنفيذ حالياً. يرجى الانتظار أو الضغط على إيقاف.");
  }
  isTaskRunning = true;
  shouldStopTask = false;

  const page = await ensureBrowser(showWindow);
  const history = [];
  const maxTurns = 15;
  let finalAnswer = "";
  let totalInput = 0;
  let totalOutput = 0;

  broadcastEvent("status", { state: "running", task });

  try {
    for (let turn = 1; turn <= maxTurns; turn++) {
      if (shouldStopTask) {
        broadcastEvent("thought", { message: "تم إيقاف المهمة بناءً على طلبك." });
        break;
      }

      await updateScreenshot();

      const pageInfo = {
        url: page.url(),
        title: await page.title().catch(() => ""),
      };

      const elements = await getInteractiveElements(page);

      broadcastEvent("thought", {
        turn,
        message: `Mercury 2.5 يحلل الشاشة والصفحة ويخطط للخطوة [${turn}/${maxTurns}]...`,
      });

      const tStart = performance.now();
      const decision = await callMercuryAgent({ task, history, pageInfo, elements });
      const durationMs = Math.round(performance.now() - tStart);

      totalInput += decision.tokens.input;
      totalOutput += decision.tokens.output;

      broadcastEvent("action", {
        turn,
        thought: decision.thought,
        tool: decision.tool,
        args: decision.args,
        durationMs,
      });

      let toolResult = {};

      if (decision.tool === "goto") {
        let target = decision.args.url || "https://www.google.com";
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
          target = "https://" + target;
        }
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1500);
        // Handle common consent dialogs
        try {
          const btn = page.locator('button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Reject all"), button:has-text("وافق على الكل")').first();
          if (await btn.isVisible({ timeout: 1500 })) await btn.click();
        } catch {}
        toolResult = { url: page.url(), title: await page.title() };
      } else if (decision.tool === "click") {
        const { index, text } = decision.args;
        let clicked = false;
        if (typeof index === "number") {
          clicked = await page.evaluate((idx) => {
            const el = document.querySelector(`[data-agent-idx="${idx}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "instant", block: "center" });
              el.click();
              return true;
            }
            return false;
          }, index);
        }
        if (!clicked && text) {
          const loc = page.locator(`text="${text}"`).first();
          if (await loc.isVisible({ timeout: 3000 })) {
            await loc.click();
            clicked = true;
          }
        }
        await page.waitForTimeout(1500);
        toolResult = { clicked: clicked || "attempted" };
      } else if (decision.tool === "type") {
        const { index, text, press_enter } = decision.args;
        let typed = false;
        if (typeof index === "number") {
          typed = await page.evaluate(
            ({ idx, val }) => {
              const el = document.querySelector(`[data-agent-idx="${idx}"]`);
              if (el) {
                el.scrollIntoView({ behavior: "instant", block: "center" });
                el.focus();
                el.value = val;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
              }
              return false;
            },
            { idx: index, val: text }
          );
        }
        if (!typed) {
          await page.keyboard.type(text);
        }
        if (press_enter) {
          await page.keyboard.press("Enter");
        }
        await page.waitForTimeout(1500);
        toolResult = { typed: text, submitted: Boolean(press_enter) };
      } else if (decision.tool === "press_key") {
        const key = decision.args.key || "Enter";
        await page.keyboard.press(key);
        await page.waitForTimeout(1000);
        toolResult = { pressed: key };
      } else if (decision.tool === "scroll") {
        const amount = decision.args.amount || 400;
        const dir = decision.args.direction === "up" ? -amount : amount;
        await page.evaluate((y) => window.scrollBy(0, y), dir);
        await page.waitForTimeout(800);
        toolResult = { scrolled: dir };
      } else if (decision.tool === "wait") {
        const secs = Math.min(decision.args.seconds || 2, 5);
        await page.waitForTimeout(secs * 1000);
        toolResult = { waited: `${secs}s` };
      } else if (decision.tool === "finish") {
        finalAnswer = decision.args.summary || "تم إنجاز المهمة بنجاح.";
        broadcastEvent("finish", {
          answer: finalAnswer,
          tokens: { input: totalInput, output: totalOutput },
        });
        break;
      }

      history.push({ tool: decision.tool, args: decision.args, result: toolResult });
      broadcastEvent("step_result", { turn, tool: decision.tool, result: toolResult });
      await updateScreenshot();
    }
  } catch (err) {
    broadcastEvent("error", { message: err.message });
  } finally {
    isTaskRunning = false;
    await updateScreenshot();
    broadcastEvent("status", { state: "idle" });
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE Stream
  if (url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("event: connected\ndata: {}\n\n");
    sseClients.add(res);

    req.on("close", () => {
      sseClients.delete(res);
    });
    return;
  }

  // Live Screenshot Endpoint (Direct JPG binary, ultra fast)
  if (url.pathname === "/api/screen.jpg") {
    if (latestScreenshotBuffer) {
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, must-revalidate",
      });
      res.end(latestScreenshotBuffer);
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  // API: Chat / Task Submit
  if (url.pathname === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { message, showWindow = true } = JSON.parse(body || "{}");
        if (!message) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Message is required" }));
          return;
        }

        runAutonomousTask(message, showWindow).catch((err) => {
          broadcastEvent("error", { message: err.message });
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "started" }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Stop
  if (url.pathname === "/api/stop" && req.method === "POST") {
    shouldStopTask = true;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "stopping" }));
    return;
  }

  // Serve Static Assets
  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
  };

  const contentType = mimeTypes[ext] || "text/plain";
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` 🌐 General-Purpose Browser Agent Server is running!   `);
  console.log(` 🚀 Open in browser: http://localhost:${PORT}        `);
  console.log(`======================================================\n`);
});
