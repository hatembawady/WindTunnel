// Mercury 2.5 General-Purpose Autonomous Agent Client
document.addEventListener("DOMContentLoaded", () => {
  const chatStream = document.getElementById("chat-stream");
  const promptForm = document.getElementById("prompt-form");
  const promptInput = document.getElementById("prompt-input");
  const btnSubmit = document.getElementById("btn-submit");
  const btnAbort = document.getElementById("btn-abort");
  const btnClearChat = document.getElementById("btn-clear-chat");
  const showDesktopWindow = document.getElementById("show-desktop-window");
  const suggestionsBar = document.getElementById("suggestions-bar");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const themeIcon = document.getElementById("theme-icon");

  const liveScreenImg = document.getElementById("live-screen-img");
  const screenIdleState = document.getElementById("screen-idle-state");
  const liveUrl = document.getElementById("live-url");
  const btnReloadScreen = document.getElementById("btn-reload-screen");
  const logEntries = document.getElementById("log-entries");
  const stepBadge = document.getElementById("step-badge");
  const agentStatusPill = document.getElementById("agent-status-pill");
  const agentStatusLabel = document.getElementById("agent-status-label");

  let isRunning = false;

  // 1. Theme Management (Light / Dark)
  let currentTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeIcon();

  btnThemeToggle.addEventListener("click", () => {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("theme", currentTheme);
    updateThemeIcon();
  });

  function updateThemeIcon() {
    themeIcon.textContent = currentTheme === "light" ? "🌙" : "☀️";
  }

  // 2. High-Performance SSE Event Stream
  function setupSSE() {
    const sse = new EventSource("/api/events");

    sse.addEventListener("screen_updated", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.url) liveUrl.value = data.url;
        refreshScreenImage();
      } catch (err) {
        console.error(err);
      }
    });

    sse.addEventListener("thought", (e) => {
      const data = JSON.parse(e.data);
      appendThought(data.message);
    });

    sse.addEventListener("action", (e) => {
      const data = JSON.parse(e.data);
      if (data.turn) stepBadge.textContent = `الخطوة: ${data.turn}`;
      appendAction(data.tool, data.args, data.durationMs);
      addLog(`⚡ [${data.tool}] Args: ${JSON.stringify(data.args)} (${data.durationMs}ms)`, "exec");
    });

    sse.addEventListener("step_result", (e) => {
      const data = JSON.parse(e.data);
      addLog(`✓ Result [${data.tool}]: ${JSON.stringify(data.result).slice(0, 150)}`, "res");
    });

    sse.addEventListener("finish", (e) => {
      const data = JSON.parse(e.data);
      appendAgentResponse(data.answer, data.tokens);
      setRunningState(false);
    });

    sse.addEventListener("status", (e) => {
      const data = JSON.parse(e.data);
      setRunningState(data.state === "running");
    });

    sse.addEventListener("error", (e) => {
      try {
        const data = JSON.parse(e.data);
        appendErrorMessage(data.message || "حدث خطأ أثناء تنفيذ المهمة.");
      } catch {}
      setRunningState(false);
    });

    sse.onerror = () => {
      setTimeout(setupSSE, 3000);
    };
  }

  setupSSE();

  function refreshScreenImage() {
    const img = new Image();
    img.onload = () => {
      liveScreenImg.src = img.src;
      liveScreenImg.classList.remove("hidden");
      screenIdleState.classList.add("hidden");
    };
    img.src = `/api/screen.jpg?t=${Date.now()}`;
  }

  btnReloadScreen.addEventListener("click", refreshScreenImage);

  // 3. UI State
  function setRunningState(running) {
    isRunning = running;
    if (running) {
      agentStatusPill.classList.add("busy");
      agentStatusLabel.textContent = "جاري تنفيذ مهمتك...";
      btnSubmit.classList.add("hidden");
      btnAbort.classList.remove("hidden");
    } else {
      agentStatusPill.classList.remove("busy");
      agentStatusLabel.textContent = "جاهز لأي مهمة";
      btnSubmit.classList.remove("hidden");
      btnAbort.classList.add("hidden");
    }
  }

  // 4. Chat Messages Rendering
  function appendUserMessage(text) {
    const row = document.createElement("div");
    row.className = "bubble-row user-row";
    row.innerHTML = `
      <div class="bubble-card">
        <p>${escapeHTML(text)}</p>
      </div>
    `;
    chatStream.appendChild(row);
    scrollToBottom();
  }

  function appendThought(text) {
    const card = document.createElement("div");
    card.className = "thought-bubble";
    card.innerHTML = `<span>🧠 ${escapeHTML(text)}</span>`;
    chatStream.appendChild(card);
    scrollToBottom();
  }

  function appendAction(tool, args, durationMs) {
    const card = document.createElement("div");
    card.className = "action-bubble";
    const argsStr = Object.entries(args || {})
      .map(([k, v]) => `${k}: "${typeof v === "string" ? escapeHTML(v) : JSON.stringify(v)}"`)
      .join(", ");
    card.innerHTML = `
      <span class="badge-tool">${escapeHTML(tool)}</span>
      <span style="font-size: 0.82rem; color: var(--text-muted);">${argsStr}</span>
      <span style="font-size: 0.72rem; color: var(--text-subtle); margin-right: auto;">${durationMs || 0}ms</span>
    `;
    chatStream.appendChild(card);
    scrollToBottom();
  }

  function appendAgentResponse(text, tokens) {
    const row = document.createElement("div");
    row.className = "bubble-row agent-row";
    let tokenStr = "";
    if (tokens) {
      tokenStr = `<div style="font-size: 0.74rem; color: var(--text-subtle); margin-top: 8px;">📊 التوكنز: ${tokens.input} مدخل / ${tokens.output} مخرج (Mercury 2.5)</div>`;
    }
    row.innerHTML = `
      <div class="agent-avatar">⚡</div>
      <div class="bubble-card">
        <div class="bubble-title">نتيجة المهمة</div>
        <p>${formatMarkdown(text)}</p>
        ${tokenStr}
      </div>
    `;
    chatStream.appendChild(row);
    scrollToBottom();
  }

  function appendErrorMessage(text) {
    const card = document.createElement("div");
    card.className = "thought-bubble";
    card.style.background = "rgba(239, 68, 68, 0.1)";
    card.style.borderRightColor = "#ef4444";
    card.style.color = "#ef4444";
    card.innerHTML = `<span>⚠️ ${escapeHTML(text)}</span>`;
    chatStream.appendChild(card);
    scrollToBottom();
  }

  function addLog(text, className = "") {
    const item = document.createElement("div");
    item.className = `log-item ${className}`;
    item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logEntries.appendChild(item);
    logEntries.scrollTop = logEntries.scrollHeight;
  }

  function scrollToBottom() {
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  // 5. Submit Form
  promptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const task = promptInput.value.trim();
    if (!task || isRunning) return;

    appendUserMessage(task);
    promptInput.value = "";
    promptInput.style.height = "auto";

    setRunningState(true);
    addLog(`🚀 المهمة: "${task}"`);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: task,
          showWindow: showDesktopWindow.checked,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل إرسال المهمة");
      }
    } catch (err) {
      appendErrorMessage(err.message);
      setRunningState(false);
    }
  });

  // Abort
  btnAbort.addEventListener("click", async () => {
    try {
      await fetch("/api/stop", { method: "POST" });
      addLog("⏹️ تم طلب الإيقاف.");
    } catch (e) {
      console.error(e);
    }
  });

  // Clear Chat
  btnClearChat.addEventListener("click", () => {
    chatStream.innerHTML = `
      <div class="bubble-row agent-row">
        <div class="agent-avatar">⚡</div>
        <div class="bubble-card">
          <p>تم مسح المحادثة. يمكنك إعطائي أي مهمة تصفح جديدة الآن!</p>
        </div>
      </div>
    `;
  });

  // Suggestions
  suggestionsBar.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const task = chip.getAttribute("data-task");
    if (task) {
      promptInput.value = task;
      promptInput.focus();
    }
  });

  // Auto-resize
  promptInput.addEventListener("input", () => {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + "px";
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      promptForm.dispatchEvent(new Event("submit"));
    }
  });

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMarkdown(str) {
    const escaped = escapeHTML(str);
    return escaped
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
  }
});
