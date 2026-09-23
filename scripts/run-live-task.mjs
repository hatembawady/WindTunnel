#!/usr/bin/env node
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

const apiKey = process.env.MERCURY_API_KEY || process.env.INCEPTION_API_KEY;
const baseUrl = (process.env.MERCURY_BASE_URL || "https://api.inceptionlabs.ai/v1").replace(/\/$/, "");

if (!apiKey) {
  console.error("❌ MERCURY_API_KEY is not set in .env or environment.");
  process.exit(1);
}

const TASK = process.argv[2] || "Go to YouTube and search for ahmed nagdy, then report the top search results.";

console.log("==========================================================");
console.log(" 🌐 Mercury 2.5 Live Web Agent: YouTube Search Task        ");
console.log("==========================================================");
console.log(`📋 Task: "${TASK}"`);
console.log(`🤖 LLM:   Mercury 2.5 (Diffusion Engine, Inception Labs)`);
console.log(`🔑 Key:   ${apiKey.slice(0, 8)}...`);
console.log("----------------------------------------------------------\n");

// Definition of WebMCP-style tools available to Mercury 2.5
const LIVE_TOOLS = [
  {
    name: "navigate_url",
    description: "Navigate browser to a given URL (e.g. https://www.youtube.com)",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target website URL" },
      },
      required: ["url"],
    },
  },
  {
    name: "search_on_youtube",
    description: "Type a search query into YouTube's search box and submit the search",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text" },
      },
      required: ["query"],
    },
  },
  {
    name: "extract_search_results",
    description: "Extract the list of top video titles and channel names currently visible on the page",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "take_screenshot",
    description: "Capture a screenshot of the current page state",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short description for screenshot file" },
      },
    },
  },
  {
    name: "finish_task",
    description: "Conclude the task with a final summary and answer",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Comprehensive final answer for the user" },
      },
      required: ["summary"],
    },
  },
];

async function callMercuryAgent({ task, history, pageInfo }) {
  const prompt = `You are Mercury 2.5, an autonomous AI web agent operating a live browser.

USER GOAL:
${task}

CURRENT BROWSER STATE:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}

ACTION HISTORY:
${
  history.length
    ? history.map((h, i) => `${i + 1}. Tool: ${h.tool}\n   Args: ${JSON.stringify(h.args)}\n   Result: ${JSON.stringify(h.result).slice(0, 300)}`).join("\n")
    : "No actions taken yet."
}

AVAILABLE TOOLS:
${JSON.stringify(LIVE_TOOLS, null, 2)}

INSTRUCTIONS:
1. Review the goal and history.
2. Select the next logical tool to progress toward completing the goal.
   - If not yet on YouTube, use 'navigate_url'.
   - Once on YouTube, use 'search_on_youtube' with query "ahmed nagdy".
   - Once search results appear, use 'extract_search_results' to read the results.
   - After extracting results, use 'take_screenshot' to save evidence.
   - When finished, use 'finish_task' with the final summary.
3. Respond ONLY with a valid JSON object:
   {"tool": "<exact_tool_name>", "args": { ... }}

Output strict JSON only.`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MERCURY_MODEL || "mercury-2.5",
      messages: [
        { role: "system", content: "You are an autonomous web agent. Output strict JSON only." },
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
    parsed = { tool: "navigate_url", args: { url: "https://www.youtube.com" } };
  }

  return {
    tool: parsed.tool || "navigate_url",
    args: parsed.args || {},
    tokens: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
  };
}

async function main() {
  console.log("🖥️  Launching Browser (visible window on your screen)...");
  let browser;
  try {
    browser = await chromium.launch({
      headless: false, // Visible browser window for the user!
      args: ["--start-maximized"],
    });
  } catch (e) {
    console.log("⚠️ Could not open non-headless browser, falling back to headless:", e.message);
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({
    viewport: null,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const history = [];
  const maxTurns = 8;
  let finished = false;
  let finalAnswer = "";

  for (let turn = 1; turn <= maxTurns; turn++) {
    console.log(`\n------------------ [Turn ${turn}/${maxTurns}] ------------------`);

    const pageInfo = {
      url: page.url(),
      title: await page.title().catch(() => "Loading..."),
    };

    console.log(`📍 Page: ${pageInfo.title} (${pageInfo.url})`);
    console.log("🤔 Mercury 2.5 is thinking and planning next action...");

    const t0 = performance.now();
    const action = await callMercuryAgent({ task: TASK, history, pageInfo });
    const lat = (performance.now() - t0).toFixed(0);

    console.log(`⚡ Mercury Decided in ${lat}ms:`);
    console.log(`   Tool: "${action.tool}"`);
    console.log(`   Args: ${JSON.stringify(action.args)}`);

    let result = {};

    try {
      if (action.tool === "navigate_url") {
        const targetUrl = action.args.url || "https://www.youtube.com";
        console.log(`🚀 Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2000);

        // Dismiss YouTube cookie dialog if present
        try {
          const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Reject all"), button:has-text("وافق على الكل")').first();
          if (await consentBtn.isVisible({ timeout: 2000 })) {
            console.log("🍪 Dismissing YouTube consent dialog...");
            await consentBtn.click();
            await page.waitForTimeout(1000);
          }
        } catch {}

        result = { success: true, current_url: page.url(), title: await page.title() };
      } else if (action.tool === "search_on_youtube") {
        const query = action.args.query || "ahmed nagdy";
        console.log(`🔍 Searching YouTube for "${query}"...`);

        // Find search input
        const searchInput = page.locator('input#search, input[name="search_query"], input.ytSearchboxComponentInput').first();
        await searchInput.waitFor({ state: "visible", timeout: 15000 });
        await searchInput.click();
        await searchInput.fill(query);
        await page.keyboard.press("Enter");

        console.log("⏳ Waiting for search results to load...");
        await page.waitForTimeout(3500);

        result = { success: true, searched_for: query, current_url: page.url() };
      } else if (action.tool === "extract_search_results") {
        console.log("📋 Extracting top video titles and channel names...");
        const videos = await page.evaluate(() => {
          const items = [];
          const videoElements = document.querySelectorAll("ytd-video-renderer, ytd-channel-renderer");
          for (let i = 0; i < Math.min(items.length < 5 ? 10 : 5, videoElements.length); i++) {
            const el = videoElements[i];
            const titleEl = el.querySelector("#video-title, #channel-title, .title-and-badge");
            const channelEl = el.querySelector("#channel-name, #text.ytd-channel-name");
            const title = titleEl?.textContent?.trim() || "";
            const channel = channelEl?.textContent?.trim() || "";
            const link = titleEl?.getAttribute("href") || "";
            if (title) {
              items.push({
                index: items.length + 1,
                title,
                channel,
                link: link ? `https://www.youtube.com${link}` : "",
              });
            }
            if (items.length >= 5) break;
          }
          return items;
        });

        console.log(`✅ Extracted ${videos.length} search results from YouTube.`);
        result = { count: videos.length, videos };
      } else if (action.tool === "take_screenshot") {
        const screenshotPath = path.resolve(process.cwd(), "youtube_ahmed_nagdy.png");
        console.log(`📸 Taking screenshot -> ${screenshotPath}...`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        result = { success: true, saved_to: screenshotPath };
      } else if (action.tool === "finish_task") {
        finished = true;
        finalAnswer = action.args.summary || "Task finished.";
        result = { completed: true };
      }
    } catch (err) {
      console.error(`⚠️ Error executing ${action.tool}:`, err.message);
      result = { error: err.message };
    }

    history.push({ tool: action.tool, args: action.args, result });

    if (finished) {
      break;
    }

    await page.waitForTimeout(1000);
  }

  // Ensure screenshot is taken before closing
  const finalScreenshot = path.resolve(process.cwd(), "youtube_ahmed_nagdy.png");
  if (!fs.existsSync(finalScreenshot)) {
    await page.screenshot({ path: finalScreenshot });
  }

  console.log("\n==========================================================");
  console.log(" 🎉 Task Complete! Summary from Mercury 2.5:              ");
  console.log("==========================================================");
  console.log(finalAnswer || "Search executed and results displayed successfully on YouTube.");
  console.log(`📸 Screenshot saved at: ${finalScreenshot}`);

  console.log("\nLeaving browser open for 10 seconds so you can see it...");
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
