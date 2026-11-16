// src/app/api/ads/explain/route.ts — "למה המשתמש הזה לא רואה פרסומת?" (bloc ADS-1b, SQL 176).
//
// POST { email, screen?, slot? }  (ads.read) → ההסבר מ-bloc (/api/internal/ads/explain, חתום). קריאה בלבד: bloc לא כותב
// דבר ולא סופר. הבדיקה נרשמת ביומן הפאנל (AD_EXPLAIN — מי בדק את מי), בלי התשובה עצמה.
// ADS-2א (החלטות 376, 378): slot — איפה הפרסומת יושבת (full: כרטיס / חלון קופץ / מסך מלא / סטורי; banner: פס; inline: כרטיס ברשימה /
// קרוסלה), ולכל slot כללי תדירות משלו; bloc מעביר אותו ל-ad_explain (p_slot). full — ברירת המחדל, ולא נשלח: הבקשה זהה לבקשה
// של היום (bloc שלא מכיר slot עונה כמו תמיד). bloc ישן שדוחה slot אחר — משפט שאומר את זה, לא "הבדיקה נכשלה".
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { callBloc } from "@/lib/blocApi";
import { parseBody } from "@/lib/validation";
import { AD_SLOTS } from "@/lib/adsFormats";
import { EXPLAIN_SLOT_UNSUPPORTED_TEXT } from "@/lib/adsExplain";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const Schema = z.object({
  email: z.string().trim().email("מייל לא תקין").max(200, "המייל ארוך מדי"),
  screen: z.enum(["home", "market", "events"]).default("home"),
  slot: z.enum(AD_SLOTS, { errorMap: () => ({ message: "סוג פרסומת לא תקין" }) }).default("full"),
}).strict();

const firstIp = (h: string | null) => (h ? h.split(",")[0]?.trim() || undefined : undefined);

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "ads.read" });
  if (!g.ok) return g.response;
  const p = await parseBody(req, Schema);
  if (!p.ok) return p.response;
  const { email, screen, slot } = p.data;
  const extra = slot !== "full" ? { slot } : {};

  const r = await callBloc("/api/internal/ads/explain", { email, screen, ...extra });
  if (!r.ok) {
    // bloc שעוד לא מכיר slot (לפני ADS-2א) דוחה את השדה — אומרים את זה, בלי "נכשל".
    if (slot !== "full" && r.status === 400) {
      return NextResponse.json({ error: EXPLAIN_SLOT_UNSUPPORTED_TEXT, code: "slot_unsupported" }, { status: 400, headers: noStore });
    }
    // bloc ישן (לפני ADS-1b) עונה 401 / 404 בלי קוד — כבר מתורגם ב-callBloc למשפט עם הפתרון.
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers: noStore });
  }
  await auditLog(g.session, "AD_EXPLAIN", "tenant", undefined, { email: email.toLowerCase(), screen, ...extra }, firstIp(req.headers.get("x-forwarded-for")));
  return NextResponse.json({ ok: true, result: r.data }, { headers: noStore });
}
