// public/sw.js (blocpanel) — bloc החלטה 589 (הבעלים, 22/11): הפאנל לא שומר עותק של דפים או של נתונים במכשיר.
// עד עכשיו כל דף (גם דפי דיירים) וכל קובץ שנטען נשמרו ב-Cache Storage והוצגו כשאין רשת — גם אחרי יציאה מהחשבון, באותו מחשב.
//   • ניווט לדף: רק מהרשת; בלי רשת — דף קטן "אין חיבור" (אף פעם לא עותק ישן של דף).
//   • כל השאר (/api/, קבצים, דומיינים אחרים כמו הקבצים המוצפנים מ-Supabase): הדפדפן כרגיל — ה-service worker לא נוגע ולא שומר.
//   • בהפעלה: נמחקים כל העותקים שנשמרו בגרסה הקודמת (blocpanel-v1).
const VERSION = "blocpanel-v2-no-copies";

const OFFLINE_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אין חיבור · bloc panel</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#0b0b0d;color:#e5e7eb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{max-width:360px}h1{font-size:20px;margin:0 0 8px}p{font-size:15px;line-height:1.6;color:#a1a1aa;margin:0}
button{margin-top:18px;min-height:44px;padding:0 22px;border-radius:10px;border:1px solid #3f3f46;background:#18181b;color:#fff;font:inherit;font-size:15px;cursor:pointer}</style></head>
<body><main><h1>אין חיבור</h1><p>הפאנל לא שומר עותק של דפים במכשיר, כדי שמידע לא יישאר אחרי יציאה מהחשבון. כשהחיבור יחזור, הדף ייטען.</p>
<button type="button" onclick="location.reload()">לנסות שוב</button></main></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  e.respondWith(
    fetch(req).catch(() => new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    }))
  );
});
