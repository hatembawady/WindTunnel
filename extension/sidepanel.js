// ChatGPT 1:1 Autonomous Copilot with Mercury 2.5
// Strictly Zero Emojis - Vector SVG Icons Only

const DEFAULT_API_KEY = "sk_f1897d354dc49b1b97255f40b2fb36ea";
const DEFAULT_BASE_URL = "https://api.inceptionlabs.ai/v1";

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const sunIcon = btnThemeToggle?.querySelector(".sun-icon");
  const moonIcon = btnThemeToggle?.querySelector(".moon-icon");
  const btnNewChat = document.getElementById("btn-new-chat");
  const btnSettingsToggle = document.getElementById("btn-settings-toggle");
  const settingsModal = document.getElementById("settings-modal");
  const inputApiKey = document.getElementById("input-api-key");
  const btnCloseSettings = document.getElementById("btn-close-settings");
  const btnSaveKey = document.getElementById("btn-save-key");
  const tabLabel = document.getElementById("tab-label");
  const chatgptBody = document.getElementById("chatgpt-body");
  const emptyHero = document.getElementById("empty-hero");
  const messagesFlow = document.getElementById("messages-flow");
  const composerForm = document.getElementById("composer-form");
  const composerInput = document.getElementById("composer-input");
  const btnSubmit = document.getElementById("btn-submit");
  const btnStopTask = document.getElementById("btn-stop-task");

  let isRunning = false;
  let abortRequested = false;

  // 1. Theme Management (ChatGPT Dark by default)
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "light") {
      sunIcon?.classList.add("hidden");
      moonIcon?.classList.remove("hidden");
    } else {
      sunIcon?.classList.remove("hidden");
      moonIcon?.classList.add("hidden");
    }
  }

  const savedTheme = (typeof chrome !== "undefined" && chrome?.storage?.local)
    ? (await chrome.storage.local.get(["chatgptTheme"])).chatgptTheme || "dark"
    : localStorage.getItem("chatgptTheme") || "dark";

  applyTheme(savedTheme);

  btnThemeToggle?.addEventListener("click", async () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      await chrome.storage.local.set({ chatgptTheme: newTheme });
    } else {
      localStorage.setItem("chatgptTheme", newTheme);
    }
  });

  // 2. Settings & Storage
  let stored = {};
  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
    stored = await chrome.storage.local.get(["mercuryApiKey", "mercuryBaseUrl"]);
  }
  let apiKey = stored.mercuryApiKey || DEFAULT_API_KEY;
  let baseUrl = stored.mercuryBaseUrl || DEFAULT_BASE_URL;
  if (inputApiKey) inputApiKey.value = apiKey;

  btnSettingsToggle?.addEventListener("click", () => {
    settingsModal?.classList.toggle("hidden");
  });

  btnCloseSettings?.addEventListener("click", () => {
    settingsModal?.classList.add("hidden");
  });

  btnSaveKey?.addEventListener("click", async () => {
    apiKey = inputApiKey.value.trim() || DEFAULT_API_KEY;
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      await chrome.storage.local.set({ mercuryApiKey: apiKey });
    }
    settingsModal?.classList.add("hidden");
  });

  // 3. Active Tab Monitor
  async function getActiveTab() {
    try {
      if (typeof chrome !== "undefined" && chrome?.tabs?.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
      }
      return null;
    } catch {
      return null;
    }
  }

  async function updateActiveTabDisplay() {
    const tab = await getActiveTab();
    if (tab && tab.url) {
      try {
        const urlObj = new URL(tab.url);
        const host = urlObj.hostname.replace(/^www\./, "");
        const title = tab.title || host;
        tabLabel.textContent = `${host} | ${title.slice(0, 48)}`;
        tabLabel.title = tab.url;
      } catch {
        tabLabel.textContent = tab.title || "صفحة نشطة";
      }
    } else {
      tabLabel.textContent = "لا توجد صفحة نشطة محددة";
    }
  }

  updateActiveTabDisplay();
  chrome.tabs.onActivated.addListener(updateActiveTabDisplay);
  chrome.tabs.onUpdated.addListener((_, changeInfo) => {
    if (changeInfo.status === "complete") updateActiveTabDisplay();
  });

  // 3. Scan Elements on Tab
  async function scanPageElements(tabId) {
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

              // Sleek badge on page (Strictly vector badge, no emojis)
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

  // 4. Mercury 2.5 API Integration
  async function callMercury({ task, history, pageInfo, elements }) {
    const elementsList = elements
      .map((e) => `[${e.index}] <${e.tag}${e.type ? ` type="${e.type}"` : ""}> "${e.label}"`)
      .join("\n");

    const prompt = `You are Mercury 2.5, an autonomous AI browser assistant inside Chrome sidebar.
You operate directly on the user's open tab to fulfill any task: searching, typing messages, clicking buttons, submitting forms, scrolling, or extracting information.

USER TASK:
${task}

CURRENT TAB:
- Title: ${pageInfo.title}
- URL: ${pageInfo.url}

INTERACTIVE ELEMENTS DETECTED ON THIS PAGE:
${elementsList || "None visible."}

PREVIOUS ACTIONS:
${
  history.length
    ? history
        .map((h, i) => `${i + 1}. [${h.tool}] Args: ${JSON.stringify(h.args)} -> ${JSON.stringify(h.result).slice(0, 160)}`)
        .join("\n")
    : "None yet."
}

TOOLS AVAILABLE:
- goto: { "url": "https://..." }
- click: { "index": <1..35>, "text": "<text>" }
- type: { "index": <number>, "text": "<string>", "press_enter": <boolean> }
- press_key: { "key": "Enter" | "Tab" | "Escape" }
- scroll: { "direction": "down" | "up", "amount": 400 }
- wait: { "seconds": 2 }
- finish: { "summary": "<clear, helpful final Arabic or English response>" }

GUIDELINES:
- Output ONLY valid JSON, with no backticks, no comments, no markdown wrapping.
- Format:
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
      throw new Error(`خطأ في استجابة Mercury 2.5 (${res.status}): ${errText}`);
    }

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw);
    } catch {
      parsed = { thought: "إنهاء المهمة", tool: "finish", args: { summary: raw } };
    }

    return parsed;
  }

  // 5. Execute Action on Active Tab
  async function executeOnTab(tabId, tool, args) {
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

  // 6. Autonomous Loop Runner
  async function runTask(taskPrompt) {
    if (isRunning) return;
    isRunning = true;
    abortRequested = false;

    // Transition view from empty state to conversation flow
    emptyHero.classList.add("hidden");
    messagesFlow.classList.remove("hidden");

    setRunningState(true);
    appendUserBubble(taskPrompt);

    // Create ChatGPT-style Assistant message container
    const assistant = createAssistantContainer();
    const history = [];
    const maxTurns = 12;

    const startTime = Date.now();

    try {
      for (let turn = 1; turn <= maxTurns; turn++) {
        if (abortRequested) {
          assistant.appendReasoningStep("تم إيقاف المهمة بناءً على طلبك.");
          break;
        }

        const tab = await getActiveTab();
        if (!tab || !tab.id) throw new Error("لا يوجد تبويب نشط للتحكم به.");

        const pageInfo = { title: tab.title || "", url: tab.url || "" };
        const elements = await scanPageElements(tab.id);

        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        assistant.setThinkingTitle(`خطوة ${turn}/${maxTurns} • فكر لمدة ${elapsedSec} ثوانٍ...`);

        const decision = await callMercury({ task: taskPrompt, history, pageInfo, elements });

        if (decision.thought) {
          assistant.appendReasoningStep(decision.thought);
        }

        if (decision.tool === "finish") {
          const totalSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
          assistant.finishThinking(`فكر لمدة ${totalSec} ثوانٍ`);
          assistant.setFinalContent(decision.args.summary || "تمت المهمة بنجاح!");
          break;
        }

        assistant.appendActionBadge(decision.tool, decision.args);
        const result = await executeOnTab(tab.id, decision.tool, decision.args);

        history.push({ tool: decision.tool, args: decision.args, result });
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch (err) {
      assistant.setFinalContent(`حدث خطأ أثناء تنفيذ المهمة: ${err.message}`);
    } finally {
      isRunning = false;
      setRunningState(false);

      // Clean badges on the active tab
      const tab = await getActiveTab();
      if (tab?.id) {
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: () => document.querySelectorAll(".__chatgpt_agent_badge").forEach((b) => b.remove()),
          })
          .catch(() => {});
      }
    }
  }

  // 7. Message Elements Factory
  function appendUserBubble(text) {
    const row = document.createElement("div");
    row.className = "user-msg-row";
    row.innerHTML = `<div class="user-bubble">${escapeHTML(text)}</div>`;
    messagesFlow.appendChild(row);
    scrollToBottom();
  }

  function createAssistantContainer() {
    const row = document.createElement("div");
    row.className = "assistant-msg-row";

    // ChatGPT Spark / Knot SVG Avatar (Strictly Vector, No Emoji)
    const avatar = document.createElement("div");
    avatar.className = "assistant-avatar";
    avatar.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10a9.96 9.96 0 0 1-4.717-1.173L2 22l1.248-5.183A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2z"></path>
      </svg>
    `;

    const body = document.createElement("div");
    body.className = "assistant-body";

    // Reasoning box (ChatGPT o1/o3 style)
    const reasoningBox = document.createElement("div");
    reasoningBox.className = "reasoning-box";
    reasoningBox.innerHTML = `
      <div class="reasoning-toggle">
        <span class="reasoning-title">جاري التفكير والتنفيذ...</span>
        <span class="reasoning-arrow">▾</span>
      </div>
      <div class="reasoning-content"></div>
    `;

    const toggleBtn = reasoningBox.querySelector(".reasoning-toggle");
    const reasoningContent = reasoningBox.querySelector(".reasoning-content");
    const reasoningTitle = reasoningBox.querySelector(".reasoning-title");
    const reasoningArrow = reasoningBox.querySelector(".reasoning-arrow");

    toggleBtn.addEventListener("click", () => {
      const isHidden = reasoningContent.classList.toggle("hidden");
      reasoningArrow.classList.toggle("collapsed", isHidden);
    });

    const textContent = document.createElement("div");
    textContent.className = "assistant-text-content";

    // Message action buttons (Copy SVG)
    const actionsToolbar = document.createElement("div");
    actionsToolbar.className = "msg-actions-toolbar hidden";
    actionsToolbar.innerHTML = `
      <button class="msg-action-btn btn-copy" title="نسخ الرد">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    `;

    const btnCopy = actionsToolbar.querySelector(".btn-copy");
    btnCopy.addEventListener("click", () => {
      const rawText = textContent.innerText;
      navigator.clipboard.writeText(rawText);
      btnCopy.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10a37f" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        btnCopy.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 2000);
    });

    body.appendChild(reasoningBox);
    body.appendChild(textContent);
    body.appendChild(actionsToolbar);

    row.appendChild(avatar);
    row.appendChild(body);

    messagesFlow.appendChild(row);
    scrollToBottom();

    return {
      setThinkingTitle(title) {
        reasoningTitle.textContent = title;
      },
      appendReasoningStep(step) {
        const item = document.createElement("div");
        item.className = "reasoning-step";
        item.textContent = step;
        reasoningContent.appendChild(item);
        scrollToBottom();
      },
      appendActionBadge(tool, args) {
        const chip = document.createElement("div");
        chip.className = "action-chip";
        chip.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>${escapeHTML(tool)}: ${escapeHTML(JSON.stringify(args))}</span>
        `;
        reasoningContent.appendChild(chip);
        scrollToBottom();
      },
      finishThinking(finalTitle) {
        reasoningTitle.textContent = finalTitle || "فكر لعدة ثوانٍ";
        reasoningContent.classList.add("hidden");
        reasoningArrow.classList.add("collapsed");
      },
      setFinalContent(markdownText) {
        textContent.innerHTML = formatMarkdown(markdownText);
        actionsToolbar.classList.remove("hidden");
        scrollToBottom();
      },
    };
  }

  function setRunningState(running) {
    if (running) {
      btnSubmit.classList.add("hidden");
      btnStopTask.classList.remove("hidden");
    } else {
      btnSubmit.classList.remove("hidden");
      btnStopTask.classList.add("hidden");
    }
  }

  function scrollToBottom() {
    chatgptBody.scrollTop = chatgptBody.scrollHeight;
  }

  // 8. Composer Auto-Grow & Event Handling
  composerInput.addEventListener("input", () => {
    // Dynamic height calculation
    composerInput.style.height = "auto";
    composerInput.style.height = Math.min(composerInput.scrollHeight, 140) + "px";

    // Toggle active state of send button
    if (composerInput.value.trim().length > 0) {
      btnSubmit.classList.add("active");
    } else {
      btnSubmit.classList.remove("active");
    }
  });

  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composerForm.dispatchEvent(new Event("submit"));
    }
  });

  composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const task = composerInput.value.trim();
    if (!task || isRunning) return;

    composerInput.value = "";
    composerInput.style.height = "auto";
    btnSubmit.classList.remove("active");

    runTask(task);
  });

  btnStopTask.addEventListener("click", () => {
    abortRequested = true;
  });

  // 9. New Chat Action
  btnNewChat.addEventListener("click", () => {
    messagesFlow.innerHTML = "";
    messagesFlow.classList.add("hidden");
    emptyHero.classList.remove("hidden");
    composerInput.value = "";
    composerInput.style.height = "auto";
    btnSubmit.classList.remove("active");
  });



    // ==========================================
  // 10. Scheduled Tasks Management System
  // ==========================================
  const btnSchedulesToggle = document.getElementById("btn-schedules-toggle");
  const schedulesBadge = document.getElementById("schedules-badge");
  const schedulesModal = document.getElementById("schedules-modal");
  const schedulesListView = document.getElementById("schedules-list-view");
  const schedulesFormView = document.getElementById("schedules-form-view");
  const schedulesLogsView = document.getElementById("schedules-logs-view");

  const btnOpenCreateTask = document.getElementById("btn-open-create-task");
  const btnEmptyCreate = document.getElementById("btn-empty-create");
  const btnCloseSchedules = document.getElementById("btn-close-schedules");
  const btnBackToList = document.getElementById("btn-back-to-list");
  const btnCloseForm = document.getElementById("btn-close-form");
  const btnBackFromLogs = document.getElementById("btn-back-from-logs");
  const btnCloseLogs = document.getElementById("btn-close-logs");

  const tasksEmptyState = document.getElementById("tasks-empty-state");
  const tasksCardsList = document.getElementById("tasks-cards-list");

  // Form Elements
  const scheduleTaskForm = document.getElementById("schedule-task-form");
  const taskIdField = document.getElementById("task-id-field");
  const taskNameInput = document.getElementById("task-name-input");
  const taskPromptInput = document.getElementById("task-prompt-input");
  const taskUrlInput = document.getElementById("task-url-input");
  const btnUseCurrentTab = document.getElementById("btn-use-current-tab");
  const formViewTitle = document.getElementById("form-view-title");
  const scheduleTypeRadios = document.querySelectorAll('input[name="scheduleType"]');
  const optInterval = document.getElementById("opt-interval");
  const optDaily = document.getElementById("opt-daily");
  const optOnce = document.getElementById("opt-once");
  const taskIntervalSelect = document.getElementById("task-interval-select");
  const taskDailyTime = document.getElementById("task-daily-time");
  const taskOnceDatetime = document.getElementById("task-once-datetime");
  const taskBgToggle = document.getElementById("task-bg-toggle");
  const taskCloseToggle = document.getElementById("task-close-toggle");
  const taskNotifyToggle = document.getElementById("task-notify-toggle");
  const btnCancelTask = document.getElementById("btn-cancel-task");

  // Logs View Elements
  const logsTaskTitle = document.getElementById("logs-task-title");
  const logsTaskSubtitle = document.getElementById("logs-task-subtitle");
  const logsEmptyState = document.getElementById("logs-empty-state");
  const logsListFlow = document.getElementById("logs-list-flow");

  let runningTaskId = null;

  // View Navigation Helpers
  function showModalView(view) {
    schedulesListView?.classList.add("hidden");
    schedulesFormView?.classList.add("hidden");
    schedulesLogsView?.classList.add("hidden");
    view?.classList.remove("hidden");
  }

  btnSchedulesToggle?.addEventListener("click", () => {
    schedulesModal?.classList.toggle("hidden");
    if (!schedulesModal?.classList.contains("hidden")) {
      showModalView(schedulesListView);
      loadAndRenderScheduledTasks();
    }
  });

  btnCloseSchedules?.addEventListener("click", () => schedulesModal?.classList.add("hidden"));
  btnCloseForm?.addEventListener("click", () => schedulesModal?.classList.add("hidden"));
  btnCloseLogs?.addEventListener("click", () => schedulesModal?.classList.add("hidden"));

  btnOpenCreateTask?.addEventListener("click", () => openTaskForm());
  btnEmptyCreate?.addEventListener("click", () => openTaskForm());
  btnBackToList?.addEventListener("click", () => showModalView(schedulesListView));
  btnBackFromLogs?.addEventListener("click", () => showModalView(schedulesListView));
  btnCancelTask?.addEventListener("click", () => showModalView(schedulesListView));

  // Switch Schedule Type Options
  scheduleTypeRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const type = e.target.value;
      optInterval?.classList.toggle("hidden", type !== "interval");
      optDaily?.classList.toggle("hidden", type !== "daily");
      optOnce?.classList.toggle("hidden", type !== "once");
    });
  });

  // Use Current Tab URL
  btnUseCurrentTab?.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (tab && tab.url) {
      taskUrlInput.value = tab.url;
    }
  });

  // Open Form for Create or Edit
  function openTaskForm(task = null) {
    scheduleTaskForm.reset();
    if (task) {
      formViewTitle.textContent = "تعديل المهمة المجدولة";
      taskIdField.value = task.id;
      taskNameInput.value = task.name || "";
      taskPromptInput.value = task.prompt || "";
      taskUrlInput.value = task.url || "";

      const radio = document.querySelector(`input[name="scheduleType"][value="${task.scheduleType || 'interval'}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change"));
      }

      if (task.intervalMinutes) taskIntervalSelect.value = String(task.intervalMinutes);
      if (task.dailyTime) taskDailyTime.value = task.dailyTime;
      if (task.onceDateTime) taskOnceDatetime.value = task.onceDateTime;

      taskBgToggle.checked = task.runInBackground !== false;
      taskCloseToggle.checked = task.closeTabOnFinish !== false;
      taskNotifyToggle.checked = task.notifyOnComplete !== false;
    } else {
      formViewTitle.textContent = "إضافة مهمة مجدولة";
      taskIdField.value = "";
      const defaultRadio = document.querySelector('input[name="scheduleType"][value="interval"]');
      if (defaultRadio) {
        defaultRadio.checked = true;
        defaultRadio.dispatchEvent(new Event("change"));
      }
      taskIntervalSelect.value = "30";
      taskDailyTime.value = "09:00";

      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      taskOnceDatetime.value = d.toISOString().slice(0, 16);

      taskBgToggle.checked = true;
      taskCloseToggle.checked = true;
      taskNotifyToggle.checked = true;
    }
    showModalView(schedulesFormView);
  }

  // Handle Form Submit
  scheduleTaskForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskId = taskIdField.value || `task_${Date.now()}`;
    const name = taskNameInput.value.trim();
    const prompt = taskPromptInput.value.trim();
    const url = taskUrlInput.value.trim();
    const selectedType = document.querySelector('input[name="scheduleType"]:checked')?.value || "interval";

    const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
    const existingIndex = scheduledTasks.findIndex((t) => t.id === taskId);
    const existingTask = existingIndex !== -1 ? scheduledTasks[existingIndex] : null;

    const taskData = {
      id: taskId,
      name,
      prompt,
      url,
      scheduleType: selectedType,
      intervalMinutes: parseInt(taskIntervalSelect.value, 10) || 30,
      dailyTime: taskDailyTime.value || "09:00",
      onceDateTime: taskOnceDatetime.value || "",
      runInBackground: taskBgToggle.checked,
      closeTabOnFinish: taskCloseToggle.checked,
      notifyOnComplete: taskNotifyToggle.checked,
      enabled: existingTask ? existingTask.enabled : true,
      createdAt: existingTask ? existingTask.createdAt : Date.now(),
      lastRun: existingTask ? existingTask.lastRun : null,
      lastStatus: existingTask ? existingTask.lastStatus : null,
      lastSummary: existingTask ? existingTask.lastSummary : null,
      history: existingTask ? existingTask.history || [] : [],
    };

    if (existingIndex !== -1) {
      scheduledTasks[existingIndex] = taskData;
    } else {
      scheduledTasks.push(taskData);
    }

    await chrome.storage.local.set({ scheduledTasks });
    chrome.runtime.sendMessage({ action: "SYNC_ALARMS" });

    showModalView(schedulesListView);
    await loadAndRenderScheduledTasks();
  });

  // Load and Render Tasks
  async function loadAndRenderScheduledTasks() {
    const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);

    // Update Badge
    const activeCount = scheduledTasks.filter((t) => t.enabled).length;
    if (activeCount > 0) {
      schedulesBadge.textContent = String(activeCount);
      schedulesBadge.classList.remove("hidden");
    } else {
      schedulesBadge.classList.add("hidden");
    }

    if (scheduledTasks.length === 0) {
      tasksEmptyState.classList.remove("hidden");
      tasksCardsList.classList.add("hidden");
      return;
    }

    tasksEmptyState.classList.add("hidden");
    tasksCardsList.classList.remove("hidden");
    tasksCardsList.innerHTML = "";

    scheduledTasks.forEach((task) => {
      const card = createTaskCard(task);
      tasksCardsList.appendChild(card);
    });
  }

  // Create Single Task Card Element
  function createTaskCard(task) {
    const card = document.createElement("div");
    card.className = `task-card ${runningTaskId === task.id ? "is-running" : ""}`;

    // Format schedule text
    let scheduleText = "";
    if (task.scheduleType === "interval") {
      const mins = task.intervalMinutes;
      if (mins < 60) scheduleText = `كل ${mins} دقيقة`;
      else if (mins === 60) scheduleText = "كل ساعة";
      else if (mins % 60 === 0) scheduleText = `كل ${mins / 60} ساعات`;
      else scheduleText = `كل ${mins} دقيقة`;
    } else if (task.scheduleType === "daily") {
      scheduleText = `يومياً في ${task.dailyTime || "09:00"}`;
    } else if (task.scheduleType === "once") {
      const d = task.onceDateTime ? new Date(task.onceDateTime) : null;
      scheduleText = d ? `مرة واحدة: ${d.toLocaleDateString("ar-EG")} ${d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}` : "مرة واحدة";
    }

    // Status pill
    let statusClass = "status-paused";
    let statusLabel = "متوقفة";
    if (runningTaskId === task.id) {
      statusClass = "status-running";
      statusLabel = "قيد التنفيذ...";
    } else if (task.enabled) {
      statusClass = "status-active";
      statusLabel = "نشطة";
    }

    // Last run text
    let lastRunText = "لم تنفذ بعد";
    if (task.lastRun) {
      const date = new Date(task.lastRun);
      lastRunText = `آخر تشغيل: ${date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })} (${task.lastStatus === "error" ? "خطأ" : "نجاح"})`;
    }

    card.innerHTML = `
      <div class="task-card-header">
        <div class="task-title-group">
          <span class="task-status-pill ${statusClass}">
            <span class="status-dot"></span>
            <span>${statusLabel}</span>
          </span>
          <span class="task-card-title" title="${escapeHTML(task.name)}">${escapeHTML(task.name)}</span>
        </div>
        <label class="task-toggle-switch" title="${task.enabled ? 'إيقاف المهمة' : 'تفعيل المهمة'}">
          <input type="checkbox" class="task-enable-checkbox" ${task.enabled ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="task-card-meta">
        <span class="meta-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${scheduleText}</span>
        </span>
        ${
          task.url
            ? `<span class="meta-chip" title="${escapeHTML(task.url)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                </svg>
                <span>${escapeHTML(task.url.replace("https://", "").replace("http://", "").replace("www.", "").slice(0, 24))}</span>
              </span>`
            : ""
        }
        <span class="meta-chip">
          <span>${lastRunText}</span>
        </span>
      </div>

      <div class="task-prompt-box">
        ${escapeHTML(task.prompt)}
      </div>

      <div class="task-card-footer">
        <div class="card-action-btn-group">
          <button class="card-btn card-btn-run btn-run-now" title="تشغيل فوري الآن">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>تشغيل الآن</span>
          </button>
          <button class="card-btn btn-view-logs" title="عرض سجل التنفيذ ونتائج الذكاء الاصطناعي">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span>السجل (${task.history ? task.history.length : 0})</span>
          </button>
        </div>
        <div class="card-action-btn-group">
          <button class="card-btn btn-edit-task" title="تعديل المهمة">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="card-btn card-btn-delete btn-delete-task" title="حذف المهمة">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Toggle Enable Switch
    const checkbox = card.querySelector(".task-enable-checkbox");
    checkbox.addEventListener("change", async (e) => {
      task.enabled = e.target.checked;
      const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
      const idx = scheduledTasks.findIndex((t) => t.id === task.id);
      if (idx !== -1) {
        scheduledTasks[idx].enabled = task.enabled;
        await chrome.storage.local.set({ scheduledTasks });
        chrome.runtime.sendMessage({ action: "SYNC_ALARMS" });
        await loadAndRenderScheduledTasks();
      }
    });

    // Run Now Button
    const btnRunNow = card.querySelector(".btn-run-now");
    btnRunNow.addEventListener("click", async () => {
      btnRunNow.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        <span>جاري البدء...</span>
      `;
      btnRunNow.disabled = true;
      runningTaskId = task.id;
      loadAndRenderScheduledTasks();

      chrome.runtime.sendMessage({ action: "RUN_TASK_NOW", taskId: task.id }, () => {});
    });

    // View Logs Button
    const btnLogs = card.querySelector(".btn-view-logs");
    btnLogs.addEventListener("click", () => openLogsView(task));

    // Edit Button
    const btnEdit = card.querySelector(".btn-edit-task");
    btnEdit.addEventListener("click", () => openTaskForm(task));

    // Delete Button
    const btnDelete = card.querySelector(".btn-delete-task");
    btnDelete.addEventListener("click", async () => {
      if (confirm(`هل أنت متأكد من حذف المهمة المجدولة "${task.name}"؟`)) {
        const { scheduledTasks = [] } = await chrome.storage.local.get(["scheduledTasks"]);
        const updated = scheduledTasks.filter((t) => t.id !== task.id);
        await chrome.storage.local.set({ scheduledTasks: updated });
        chrome.runtime.sendMessage({ action: "SYNC_ALARMS" });
        await loadAndRenderScheduledTasks();
      }
    });

    return card;
  }

  // Open Logs View
  function openLogsView(task) {
    logsTaskTitle.textContent = task.name;
    logsTaskSubtitle.textContent = `إجمالي مرات التشغيل: ${task.history ? task.history.length : 0}`;

    logsListFlow.innerHTML = "";
    const history = task.history || [];

    if (history.length === 0) {
      logsEmptyState.classList.remove("hidden");
    } else {
      logsEmptyState.classList.add("hidden");
      history.forEach((entry, idx) => {
        const logCard = document.createElement("div");
        logCard.className = "log-entry-card";

        const date = new Date(entry.timestamp);
        const timeStr = `${date.toLocaleDateString("ar-EG")} ${date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
        const isError = entry.status === "error";

        logCard.innerHTML = `
          <div class="log-entry-header">
            <span class="log-time">${timeStr}</span>
            <span class="log-duration">${entry.durationSec ? `${entry.durationSec} ثانية` : ""} • ${entry.stepsCount || 0} خطوات</span>
          </div>
          <div class="log-summary ${isError ? 'error-summary' : ''}">
            ${escapeHTML(entry.summary || "تم تنفيذ المهمة.")}
          </div>
          ${
            entry.steps && entry.steps.length
              ? `
              <button class="log-steps-toggle" type="button">
                <span>تفاصيل الخطوات (${entry.steps.length})</span>
                <span>▾</span>
              </button>
              <div class="log-steps-list hidden">
                ${entry.steps
                  .map(
                    (s) =>
                      `<div class="log-step-item">
                        <strong>[${escapeHTML(s.type)}]</strong> ${escapeHTML(s.text || s.tool || s.error || s.summary || "")}
                      </div>`
                  )
                  .join("")}
              </div>`
              : ""
          }
        `;

        const stepsToggle = logCard.querySelector(".log-steps-toggle");
        const stepsList = logCard.querySelector(".log-steps-list");
        if (stepsToggle && stepsList) {
          stepsToggle.addEventListener("click", () => {
            stepsList.classList.toggle("hidden");
          });
        }

        logsListFlow.appendChild(logCard);
      });
    }

    showModalView(schedulesLogsView);
  }

  // Listen for Background Status Notifications
  if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "SCHEDULED_TASK_STATUS_CHANGE") {
        if (message.status === "running") {
          runningTaskId = message.taskId;
        } else {
          if (runningTaskId === message.taskId) runningTaskId = null;
        }
        loadAndRenderScheduledTasks();
      }
    });
  }

  // Initial load of tasks & badge count
  loadAndRenderScheduledTasks();


  // 11. Markdown & HTML Utilities
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  }

  function formatMarkdown(str) {
    const raw = String(str);

    // Code blocks ```code```
    let formatted = raw.replace(/```([\s\S]*?)```/g, (_, code) => {
      return `<pre><code>${escapeHTML(code.trim())}</code></pre>`;
    });

    // Inline code `code`
    formatted = formatted.replace(/`([^`]+)`/g, (_, code) => {
      return `<code>${escapeHTML(code)}</code>`;
    });

    // Bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic *text*
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Bullet lists
    const lines = formatted.split("\n");
    let inList = false;
    const resultLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        if (!inList) {
          resultLines.push("<ul>");
          inList = true;
        }
        resultLines.push(`<li>${trimmed.slice(2)}</li>`);
      } else {
        if (inList) {
          resultLines.push("</ul>");
          inList = false;
        }
        if (trimmed.length > 0) {
          resultLines.push(`<p>${line}</p>`);
        }
      }
    }
    if (inList) resultLines.push("</ul>");

    return resultLines.join("");
  }

  // ==========================================
  // 12. Quick Actions, Voice Input & Real-time Sync
  // ==========================================
  function initQuickActionsAndVoice() {
    // Quick Action Pills
    const quickPills = document.querySelectorAll(".quick-pill-btn");
    quickPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const prompt = pill.getAttribute("data-prompt");
        if (prompt && !isRunning) {
          runTask(prompt);
        }
      });
    });

    // Voice Input Dictation (Web Speech API)
    const btnVoiceInput = document.getElementById("btn-voice-input");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (btnVoiceInput && SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "ar-SA"; // Default Arabic, auto accepts English speech

      let isListening = false;

      recognition.onstart = () => {
        isListening = true;
        btnVoiceInput.classList.add("is-recording");
        composerInput.setAttribute("placeholder", "جاري الاستماع لصوتك...");
      };

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        composerInput.value = transcript;
        composerInput.style.height = "auto";
        composerInput.style.height = Math.min(composerInput.scrollHeight, 140) + "px";
        if (transcript.trim().length > 0) {
          btnSubmit.classList.add("active");
        }
      };

      recognition.onerror = (event) => {
        console.warn("[Mercury Voice] Speech error:", event.error);
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      function stopListening() {
        isListening = false;
        btnVoiceInput.classList.remove("is-recording");
        composerInput.setAttribute("placeholder", "اسأل أي شيء أو اطلب مهمة في الصفحة...");
      }

      btnVoiceInput.addEventListener("click", () => {
        if (isListening) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch (e) {
            console.error("[Mercury Voice] Start failed:", e);
          }
        }
      });
    } else if (btnVoiceInput) {
      btnVoiceInput.style.display = "none";
    }

    // Real-time synchronization of Scheduled Tasks from background
    if (typeof chrome !== "undefined" && chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
          if (changes.scheduledTasks) {
            loadAndRenderScheduledTasks();
          }
          if (changes.pendingPrompt?.newValue) {
            const prompt = changes.pendingPrompt.newValue;
            chrome.storage.local.remove(["pendingPrompt"]);
            if (prompt && !isRunning) {
              runTask(prompt);
            }
          }
        }
      });
    }

    // Check for pending prompt on startup (e.g. from Context Menu)
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      chrome.storage.local.get(["pendingPrompt"]).then((res) => {
        if (res.pendingPrompt && !isRunning) {
          const prompt = res.pendingPrompt;
          chrome.storage.local.remove(["pendingPrompt"]);
          runTask(prompt);
        }
      });
    }

    // Listen to direct messages from background
    if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "TRIGGER_PROMPT" && message.prompt && !isRunning) {
          runTask(message.prompt);
        }
      });
    }
  }

  // Initialize new features
  initQuickActionsAndVoice();

});