// Background service worker for Mercury 2.5 Side Panel Copilot
// Supports Autonomous Scheduled Tasks, Background Alarms & Tab Automation

const DEFAULT_API_KEY = "sk_f1897d354dc49b1b97255f40b2fb36ea";
const DEFAULT_BASE_URL = "https://api.inceptionlabs.ai/v1";

chrome.runtime.onInstalled.addListener(async () => {
  // Set default API key if not yet set
  const result = await chrome.storage.local.get(["mercuryApiKey", "mercuryBaseUrl"]);
  if (!result.mercuryApiKey) {
    await chrome.storage.local.set({
      mercuryApiKey: DEFAULT_API_KEY,
      mercuryBaseUrl: DEFAULT_BASE_URL,
    });
  }

  
  // Setup context menus
  try {
    chrome.contextMenus.create({
      id: "mercury_ask_selection",
      title: 'اسأل Mercury عن: "%s"',
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "mercury_summarize_selection",
      title: 'لخص هذا النص مع Mercury',
      contexts: ["selection"]
    });
  } catch (e) {
    console.log("[Mercury 2.5] Context menus init:", e);
  }

  // Open the side panel upon clicking the extension action icon
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

  // Sync scheduled tasks alarms
  await syncAllAlarms();
});

// Re-sync alarms on browser startup
chrome.runtime.onStartup?.addListener(async () => {
  await syncAllAlarms();
});

// Listen for alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith("task_")) {
    const taskId = alarm.name.replace("task_", "");
    const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
    const task = scheduledTasks.find((t) => t.id === taskId);
    if (task && task.enabled) {
      console.log(`[Mercury 2.5] Triggering scheduled task: ${task.name}`);
      await runScheduledTaskEngine(task);
    }
  }
});

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SYNC_ALARMS") {
    syncAllAlarms().then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.action === "RUN_TASK_NOW") {
    (async () => {
      const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
      const task = scheduledTasks.find((t) => t.id === message.taskId);
      if (task) {
        runScheduledTaskEngine(task);
        sendResponse({ success: true, message: "Task started" });
      } else {
        sendResponse({ success: false, error: "Task not found" });
      }
    })();
    return true;
  }
});

// Helper: Synchronize chrome.alarms with scheduledTasks in storage
async function syncAllAlarms() {
  try {
    const alarms = await chrome.alarms.getAll();
    for (const a of alarms) {
      if (a.name.startsWith("task_")) {
        await chrome.alarms.clear(a.name);
      }
    }

    const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
    const now = Date.now();

    for (const task of scheduledTasks) {
      if (!task.enabled) continue;

      const alarmName = `task_${task.id}`;
      if (task.scheduleType === "interval") {
        const period = Math.max(1, parseInt(task.intervalMinutes, 10) || 30);
        await chrome.alarms.create(alarmName, {
          delayInMinutes: period,
          periodInMinutes: period,
        });
      } else if (task.scheduleType === "daily") {
        const [hours, minutes] = (task.dailyTime || "09:00").split(":").map(Number);
        const target = new Date();
        target.setHours(hours, minutes, 0, 0);
        if (target.getTime() <= now) {
          target.setDate(target.getDate() + 1);
        }
        const delayInMinutes = Math.max(1, Math.round((target.getTime() - now) / 60000));
        await chrome.alarms.create(alarmName, {
          delayInMinutes,
          periodInMinutes: 1440,
        });
      } else if (task.scheduleType === "once") {
        const runTime = new Date(task.onceDateTime).getTime();
        if (runTime > now) {
          const delayInMinutes = Math.max(1, Math.round((runTime - now) / 60000));
          await chrome.alarms.create(alarmName, {
            delayInMinutes,
          });
        }
      }
    }
  } catch (err) {
    console.error("[Mercury 2.5] Error syncing alarms:", err);
  }
}

// Autonomous Agent Runner for Background Scheduled Tasks
async function runScheduledTaskEngine(task) {
  const startTime = Date.now();
  let createdTabId = null;
  let runStatus = "success";
  let summary = "";
  const executionSteps = [];

  chrome.runtime.sendMessage({
    action: "SCHEDULED_TASK_STATUS_CHANGE",
    taskId: task.id,
    status: "running",
  }).catch(() => {});

  try {
    const stored = await chrome.storage.local.get(["mercuryApiKey", "mercuryBaseUrl"]);
    const apiKey = stored.mercuryApiKey || DEFAULT_API_KEY;
    const baseUrl = stored.mercuryBaseUrl || DEFAULT_BASE_URL;

    // 1. Prepare Target URL
    let targetUrl = (task.url || "").trim();
    if (!targetUrl) targetUrl = "https://www.google.com";
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    // 2. Open Tab (background or active)
    const runInBackground = task.runInBackground !== false;
    const tab = await chrome.tabs.create({
      url: targetUrl,
      active: !runInBackground,
    });
    createdTabId = tab.id;

    // 3. Wait for tab to complete loading
    await waitForTabComplete(createdTabId, 25000);
    await new Promise((r) => setTimeout(r, 2000));

    // 4. Autonomous Agent Loop
    const history = [];
    const maxTurns = 10;

    for (let turn = 1; turn <= maxTurns; turn++) {
      let currentTab;
      try {
        currentTab = await chrome.tabs.get(createdTabId);
      } catch {
        break;
      }

      const pageInfo = { title: currentTab.title || "", url: currentTab.url || "" };
      const elements = await scanPageElementsBackground(createdTabId);

      const decision = await callMercuryBackground({
        apiKey,
        baseUrl,
        task: task.prompt,
        history,
        pageInfo,
        elements,
      });

      if (decision.thought) {
        executionSteps.push({ type: "thought", text: decision.thought, time: Date.now() });
      }

      if (decision.tool === "finish") {
        summary = decision.args?.summary || "تم تنفيذ المهمة المجدولة بنجاح.";
        executionSteps.push({ type: "finish", summary, time: Date.now() });
        break;
      }

      executionSteps.push({ type: "action", tool: decision.tool, args: decision.args, time: Date.now() });
      const actResult = await executeOnTabBackground(createdTabId, decision.tool, decision.args);
      history.push({ tool: decision.tool, args: decision.args, result: actResult });

      await new Promise((r) => setTimeout(r, 1200));
    }

    if (!summary) {
      summary = "اكتملت المهمة بانتهاء جميع الخطوات المتوقعة.";
    }

  } catch (err) {
    runStatus = "error";
    summary = `تعذر إكمال المهمة: ${err.message}`;
    executionSteps.push({ type: "error", error: err.message, time: Date.now() });
  } finally {
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    // Clean badges
    if (createdTabId) {
      chrome.scripting.executeScript({
        target: { tabId: createdTabId },
        func: () => document.querySelectorAll(".__chatgpt_agent_badge").forEach((b) => b.remove()),
      }).catch(() => {});
    }

    // Auto-close tab if enabled
    if (task.closeTabOnFinish && createdTabId) {
      await chrome.tabs.remove(createdTabId).catch(() => {});
    }

    // Record run log
    await recordTaskRunResult(task.id, {
      status: runStatus,
      summary,
      stepsCount: executionSteps.length,
      durationSec: elapsedSec,
      timestamp: Date.now(),
      steps: executionSteps,
    });

    // Chrome notification
    if (task.notifyOnComplete !== false) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title: `Mercury 2.5: ${task.name}`,
        message: summary.slice(0, 160),
        priority: 2,
      });
    }

    // One-time tasks disable
    if (task.scheduleType === "once") {
      await disableOneTimeTask(task.id);
    }

    // Broadcast finish
    chrome.runtime.sendMessage({
      action: "SCHEDULED_TASK_STATUS_CHANGE",
      taskId: task.id,
      status: runStatus,
      summary,
    }).catch(() => {});
  }
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scanPageElementsBackground(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.querySelectorAll(".__chatgpt_agent_badge").forEach((b) => b.remove());
        const elements = [];
        const candidates = document.querySelectorAll(
          'button, a, input, textarea, select, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [tabindex]:not([tabindex="-1"])'
        );

        let idx = 1;
        for (const el of candidates) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);

          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= -50 &&
            rect.top <= window.innerHeight + 50 &&
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

            const badge = document.createElement("span");
            badge.className = "__chatgpt_agent_badge";
            badge.textContent = String(idx);
            badge.style.cssText = `
              position: absolute;
              background: #10a37f;
              color: #ffffff;
              font-size: 11px;
              font-family: monospace;
              font-weight: 700;
              padding: 1px 5px;
              border-radius: 4px;
              z-index: 2147483647;
              pointer-events: none;
              box-shadow: 0 1px 4px rgba(0,0,0,0.3);
              top: ${window.scrollY + rect.top}px;
              left: ${window.scrollX + rect.left}px;
            `;
            document.body.appendChild(badge);

            idx++;
            if (idx > 35) break;
          }
        }
        return elements;
      },
    });
    return results?.[0]?.result || [];
  } catch {
    return [];
  }
}

async function callMercuryBackground({ apiKey, baseUrl, task, history, pageInfo, elements }) {
  const elementsList = elements
    .map((e) => `[${e.index}] <${e.tag}${e.type ? ` type="${e.type}"` : ""}> "${e.label}"`)
    .join("\n");

  const prompt = `You are Mercury 2.5, an autonomous AI browser assistant running a scheduled automation in Chrome.
You operate directly on the target webpage to fulfill the user's scheduled task.

TASK TO ACCOMPLISH:
${task}

PAGE CONTEXT:
- Title: ${pageInfo.title}
- URL: ${pageInfo.url}

INTERACTIVE ELEMENTS DETECTED:
${elementsList || "None visible."}

ACTION HISTORY:
${
  history.length
    ? history
        .map((h, i) => `${i + 1}. [${h.tool}] Args: ${JSON.stringify(h.args)} -> ${JSON.stringify(h.result).slice(0, 160)}`)
        .join("\n")
    : "None yet."
}

AVAILABLE TOOLS:
- goto: { "url": "https://..." }
- click: { "index": <1..35>, "text": "<text>" }
- type: { "index": <number>, "text": "<string>", "press_enter": <boolean> }
- press_key: { "key": "Enter" | "Tab" | "Escape" }
- scroll: { "direction": "down" | "up", "amount": 400 }
- wait: { "seconds": 2 }
- finish: { "summary": "<Detailed, helpful Arabic or English outcome summary>" }

Respond in STRICT JSON ONLY:
{"thought": "reasoning in Arabic or English", "tool": "tool_name", "args": { ... }}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mercury-2.5",
      messages: [
        { role: "system", content: "You are Mercury 2.5 autonomous browser copilot. Respond in strict JSON only." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`خطأ من خادم Mercury 2.5 (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content || "{}";

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : raw);
  } catch {
    return { thought: "إنهاء المهمة", tool: "finish", args: { summary: raw } };
  }
}

async function executeOnTabBackground(tabId, tool, args) {
  if (tool === "goto") {
    let target = args.url || "https://www.google.com";
    if (!target.startsWith("http://") && !target.startsWith("https://")) target = "https://" + target;
    await chrome.tabs.update(tabId, { url: target });
    await new Promise((r) => setTimeout(r, 2600));
    return { url: target };
  }

  if (tool === "click") {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ index, text }) => {
        if (typeof index === "number") {
          const el = document.querySelector(`[data-agent-idx="${index}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.click();
            return { success: true, method: "index", label: el.innerText || el.tagName };
          }
        }
        if (text) {
          const all = Array.from(document.querySelectorAll("button, a, input, [role='button']"));
          const found = all.find((el) => (el.innerText || "").toLowerCase().includes(text.toLowerCase()));
          if (found) {
            found.scrollIntoView({ behavior: "smooth", block: "center" });
            found.click();
            return { success: true, method: "text", label: found.innerText };
          }
        }
        return { success: false, reason: "Element not found" };
      },
      args: [{ index: args.index, text: args.text }],
    });
    await new Promise((r) => setTimeout(r, 1400));
    return res?.[0]?.result || { clicked: true };
  }

  if (tool === "type") {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ index, text, press_enter }) => {
        let targetEl = null;
        if (typeof index === "number") {
          targetEl = document.querySelector(`[data-agent-idx="${index}"]`);
        }
        if (!targetEl) {
          targetEl =
            document.querySelector("input:focus, textarea:focus, [contenteditable='true']:focus") ||
            document.querySelector("input, textarea");
        }
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
          targetEl.focus();
          if (targetEl.isContentEditable) {
            targetEl.innerText = text;
          } else {
            targetEl.value = text;
          }
          targetEl.dispatchEvent(new Event("input", { bubbles: true }));
          targetEl.dispatchEvent(new Event("change", { bubbles: true }));

          if (press_enter) {
            const enterEvent = new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            });
            targetEl.dispatchEvent(enterEvent);
            if (targetEl.form) targetEl.form.dispatchEvent(new Event("submit", { bubbles: true }));
          }
          return { typed: true, element: targetEl.tagName };
        }
        return { typed: false, reason: "Input field not found" };
      },
      args: [{ index: args.index, text: args.text, press_enter: args.press_enter }],
    });
    await new Promise((r) => setTimeout(r, 1400));
    return res?.[0]?.result || { typed: args.text };
  }

  
  if (tool === "press_key") {
    const keyName = args.key || "Enter";
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: (key) => {
        const activeEl = document.activeElement || document.body;
        const keyProps = {
          key: key,
          code: key === " " ? "Space" : key,
          bubbles: true,
          cancelable: true,
        };
        if (key === "Enter") {
          keyProps.keyCode = 13;
          keyProps.which = 13;
        } else if (key === "Escape") {
          keyProps.keyCode = 27;
          keyProps.which = 27;
        } else if (key === "Tab") {
          keyProps.keyCode = 9;
          keyProps.which = 9;
        }
        activeEl.dispatchEvent(new KeyboardEvent("keydown", keyProps));
        activeEl.dispatchEvent(new KeyboardEvent("keypress", keyProps));
        activeEl.dispatchEvent(new KeyboardEvent("keyup", keyProps));
        if (key === "Enter" && activeEl.form) {
          activeEl.form.dispatchEvent(new Event("submit", { bubbles: true }));
        }
        return { pressed: key, target: activeEl.tagName };
      },
      args: [keyName],
    });
    await new Promise((r) => setTimeout(r, 800));
    return res?.[0]?.result || { pressed: keyName };
  }

  if (tool === "scroll") {
    const amount = args.amount || 400;
    const dir = args.direction === "up" ? -amount : amount;
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y) => window.scrollBy({ top: y, behavior: "smooth" }),
      args: [dir],
    });
    await new Promise((r) => setTimeout(r, 700));
    return { scrolled: dir };
  }

  if (tool === "wait") {
    const s = Math.min(args.seconds || 2, 5);
    await new Promise((r) => setTimeout(r, s * 1000));
    return { waited: `${s}s` };
  }

  return {};
}

async function recordTaskRunResult(taskId, logEntry) {
  try {
    const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
    const taskIndex = scheduledTasks.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      const task = scheduledTasks[taskIndex];
      task.lastRun = logEntry.timestamp;
      task.lastStatus = logEntry.status;
      task.lastSummary = logEntry.summary;
      task.history = [logEntry, ...(task.history || [])].slice(0, 15);
      scheduledTasks[taskIndex] = task;
      await chrome.storage.local.set({ scheduledTasks });
    }
  } catch (err) {
    console.error("[Mercury 2.5] Error recording task run result:", err);
  }
}

async function disableOneTimeTask(taskId) {
  try {
    const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
    const task = scheduledTasks.find((t) => t.id === taskId);
    if (task) {
      task.enabled = false;
      await chrome.storage.local.set({ scheduledTasks });
      await chrome.alarms.clear(`task_${taskId}`);
    }
  } catch (err) {
    console.error("[Mercury 2.5] Error disabling one-time task:", err);
  }
}


// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  try {
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
    const selectedText = (info.selectionText || "").trim();
    let promptText = "";
    if (info.menuItemId === "mercury_ask_selection") {
      promptText = `بخصوص هذا النص المحدد من الصفحة:\n"${selectedText}"\nاشرح هذا الجزء وحلله بدقة وبشكل واضح.`;
    } else if (info.menuItemId === "mercury_summarize_selection") {
      promptText = `قم بتلخيص هذا النص المحدد في نقاط رئيسية موجزة ودقيقة:\n"${selectedText}"`;
    }
    if (promptText) {
      await chrome.storage.local.set({ pendingPrompt: promptText });
      chrome.runtime.sendMessage({ action: "TRIGGER_PROMPT", prompt: promptText }).catch(() => {});
    }
  } catch (err) {
    console.error("[Mercury 2.5] Context menu action error:", err);
  }
});
