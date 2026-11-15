// src/app/api/ads/route.ts — פרסומות ממומנות (bloc ADS-1, SQL 175; החלטה 75): כל הכתיבות של המסך.
//
//   POST { action, … }  (ads.manage)
//     advertiser.save / .archive / .delete
//     contract.save / .delete
//     campaign.save / .status / .duplicate / .delete
//     creative.save / .active / .delete
//     settings.save — המתג, בניינים בלי פרסומות, מכשירי בדיקה (לפי אימייל של חשבון bloc)
//
// PANEL-PAY א2ב (החלטה 371, C3): הפאנל לא כותב יותר לטבלאות ad_*. הגבולות נבדקים כאן (zod, משפט בעברית לכל שדה), והפעולה
// נחתמת ונשלחת ל-bloc (/api/internal/ads) עם השחקן מהסשן. bloc בודק שוב הרשאה (ads.manage = admin / superadmin) ואת אותה
// סכמה, מריץ את אותם כללים — הפעלת קמפיין (חוזה פעיל ובתוקף, פרסומת פעילה, תאריכים — יום לפי שעון ישראל), שכפול כטיוטה עם
// הפרסומות הפעילות, מכשירי בדיקה לפי אימייל — כותב, ורושם ביומן שלו. מה שכבר הוצג נשמר ב-DB (טריגרים ו-FK) ונענה בקוד;
// כל קוד מקבל כאן את המשפט שהפאנל הציג עד עכשיו (lib/adsActions). הצלחה — רק ok === true והמזהה כשצריך; תשובה לא ברורה —
// "ייתכן שבוצע — רעננו", אף פעם לא הצלחה. כל פעולה נרשמת ביומן הפאנל (AD_*); כשל — BLOC_ACTION_FAILED / BLOC_ACTION_UNKNOWN.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody, adActionSchema, type AdAction } from "@/lib/validation";
import { actorOf, firstIp } from "@/lib/moneyActions";
import { actionBadShape } from "@/lib/blocActions";
import { AD_ACTIONS, AD_ENTITY, adEntityId, adFacts, adsAnswer, adsFailure, adsFailureAudit, answerFacts } from "@/lib/adsActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "ads.manage" });
  if (!g.ok) return g.response;
  const session = g.session;
  const ip = firstIp(req.headers.get("x-forwarded-for"));

  const parsed = await parseBody(req, adActionSchema);
  if (!parsed.ok) return parsed.response;
  // parseBody מסיק את הטיפוס מהקלט של הסכמה; הערך עצמו הוא הפלט (אחרי ה-transform: null לשדה ריק, מחיר מעוגל, ימים ממוינים).
  const b = parsed.data as AdAction;
  const act = AD_ACTIONS[b.action];
  const entity = AD_ENTITY[act.entity].type;
  const facts = adFacts(b);

  const r = await callBloc("/api/internal/ads", { actor: actorOf(session), ...b });
  if (!r.ok) {
    const a = adsFailureAudit(r, act.audit);
    // הסימון (action / outcome / code / status) גובר על עובדה באותו שם (status של חוזה).
    await auditLog(session, a.name, entity, adEntityId(b), { ...facts, ...a.meta }, ip);
    const f = adsFailure(r, b.action);
    return NextResponse.json({ error: f.error, code: f.code }, { status: f.status, headers: noStore });
  }

  // הצלחה רק עם ok === true (ובשמירה / שכפול — המזהה); אחרת "ייתכן שבוצע".
  const done = adsAnswer(b, r.data);
  if (!done) {
    const bad = actionBadShape(act.audit);
    await auditLog(session, bad.audit.name, entity, adEntityId(b), { ...facts, ...bad.audit.meta }, ip);
    return NextResponse.json({ error: bad.error, code: bad.code }, { status: bad.status, headers: noStore });
  }

  // מה שהפאנל שלח גובר על מה ש-bloc החזיר (השמות מהתשובה — רק כשאין לפאנל משלו). unchanged — bloc מצא שכבר כך (למשל
  // אותו מצב קמפיין) ולא כתב.
  await auditLog(session, act.audit, entity, done.id ?? adEntityId(b), {
    ...answerFacts(r.data), ...facts, ...(done.creatives ? { creatives: done.creatives } : {}),
    ...(done.skipped ? { skipped_outside: done.skipped } : {}),
    ...(r.data.unchanged === true ? { unchanged: true } : {}),
  }, ip);
  return NextResponse.json({
    ok: true, ...(done.id ? { id: done.id } : {}), ...(done.creatives ? { creatives: done.creatives } : {}),
    ...(done.skipped ? { skipped_outside: done.skipped } : {}),
  }, { headers: noStore });
}
