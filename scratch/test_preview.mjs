import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 750 } });
  
  const fileUrl = 'file:///' + path.resolve(__dirname, '../extension/sidepanel.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  await page.waitForTimeout(400);

  // Simulate active conversation
  await page.evaluate(() => {
    document.getElementById('empty-hero').classList.add('hidden');
    const flow = document.getElementById('messages-flow');
    flow.classList.remove('hidden');

    // 1. User message
    const userRow = document.createElement('div');
    userRow.className = 'user-msg-row';
    const userBubble = document.createElement('div');
    userBubble.className = 'user-bubble';
    userBubble.textContent = 'ادخل على YouTube وابحث عن ahmed nagdy وافتح أول فيديو';
    userRow.appendChild(userBubble);
    flow.appendChild(userRow);

    // 2. Assistant message
    const asstRow = document.createElement('div');
    asstRow.className = 'assistant-msg-row';

    const avatar = document.createElement('div');
    avatar.className = 'assistant-avatar';
    avatar.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10a9.96 9.96 0 0 1-4.717-1.173L2 22l1.248-5.183A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2z"></path>
      </svg>
    `;

    const body = document.createElement('div');
    body.className = 'assistant-body';

    // Thinking box
    const reasoningBox = document.createElement('div');
    reasoningBox.className = 'reasoning-box';
    reasoningBox.innerHTML = `
      <div class="reasoning-toggle">
        <span class="reasoning-title">فكر لمدة 2 ثوانٍ</span>
        <span class="reasoning-arrow">▾</span>
      </div>
      <div class="reasoning-content">
        <div class="reasoning-step">الانتقال إلى موقع YouTube والتحقق من العناصر التفاعلية.</div>
        <div class="action-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <span>goto: {"url": "https://www.youtube.com"}</span>
        </div>
        <div class="reasoning-step">كتابة 'ahmed nagdy' في مربع البحث والنقر على زر البحث.</div>
        <div class="action-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <span>type: {"index": 3, "text": "ahmed nagdy", "press_enter": true}</span>
        </div>
      </div>
    `;

    const textContent = document.createElement('div');
    textContent.className = 'assistant-text-content';
    textContent.innerHTML = `
      <p>تم الانتقال إلى YouTube والبحث عن <strong>ahmed nagdy</strong> بنجاح.</p>
      <p>تم تحديد الفيديو الأول والنقر عليه لمشاهدته مباشرة في نافذة المتصفح.</p>
    `;

    const actions = document.createElement('div');
    actions.className = 'msg-actions-toolbar';
    actions.innerHTML = `
      <button class="msg-action-btn" title="نسخ الرد">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    `;

    body.appendChild(reasoningBox);
    body.appendChild(textContent);
    body.appendChild(actions);

    asstRow.appendChild(avatar);
    asstRow.appendChild(body);
    flow.appendChild(asstRow);
  });

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, '../sidepanel_active_chat.png') });
  console.log('Active chat preview saved.');
  await browser.close();
})();
