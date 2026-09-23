# دليل تشغيل WindTunnel مع Mercury 2.5 مباشرة

تم تعطيل نموذج **Jev** مؤقتاً والاعتماد بالكامل وبشكل مباشر وحصري على **Mercury 2.5** (من Inception Labs) لقيادة مهام **WebMCP**!

---

## ⚡ كيف يعمل Mercury 2.5 منفرداً الآن؟

بدلاً من تقسيم العمل بين نموذجين، يتولى **Mercury 2.5** دورة العمل كاملة في كل خطوة تصفح:
1. **قراءة أدوات WebMCP الحالية في الصفحة.**
2. **اتخاذ القرار (Tool Selection & Routing):** تقييم تقدم المهمة واختيار الأداة المناسبة أو إعلان انتهاء المهمة مباشرة.
3. **توليد المعاملات والمدخلات (Argument Generation):** توليد مدخلات الـ JSON المطابقة للـ Schema بدقة وسرعة فائقة عبر تقنية الـ Diffusion.
4. **تنفيذ الأداة:** استدعاء الأداة مباشرة في صفحة المتصفح عبر WebMCP Bridge.

---

## 🚀 أوامر التشغيل السريعة

### 1. فحص واختبار الاتصال المباشر مع Mercury 2.5:
```powershell
node scripts/test-mercury.mjs
```

### 2. تشغيل تقييم WindTunnel باستخدام Mercury 2.5:
```powershell
# باستخدام الذراع wm-mercury
$env:WT_FAKE_LIFECYCLE="1"; node harness/cli.mjs --arms wm-mercury --preset smoke
```

---

## 🔑 ملف الإعدادات `.env`

المفتاح المعتمد حالياً في ملف [`.env`](file:///E:/web-agent/.env):

```env
MERCURY_API_KEY=sk_f1897d354dc49b1b97255f40b2fb36ea
MERCURY_BASE_URL=https://api.inceptionlabs.ai/v1

WT_SIMULATE_MERCURY=0
```
تم تعطيل أي استدعاء لـ Jev تماماً، وأصبح النظام يعتمد بنسبة 100% على Mercury 2.5.
