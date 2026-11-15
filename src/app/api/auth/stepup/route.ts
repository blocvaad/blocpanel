// src/app/api/auth/stepup/route.ts — אישור לפעולת כסף (step-up, PANEL-PAY א1, החלטה 364, C4).
//
// POST { action: 'send' }            → קוד חד-פעמי בן 6 ספרות למייל של המנהל המחובר (lib/otp, purpose 'money').
// POST { action: 'verify', code }    → קוד נכון: עוגיית אישור חתומה (lib/stepUp) — 10 דקות, רק לסשן הזה.
// סשן מלא בלבד (guard; ה-middleware כבר חוסם סשן לפני 2FA), ולא לצופה (viewer) — אין לו פעולות כסף. שליחה: עד 3 ל-10
// דקות למנהל (otpRatelimit). אימות: עד 5 ניסיונות לקוד (otpTriesRatelimit); נגמרו — הקוד נמחק. הקוד נשמר רק כ-HMAC
// (panel_admins.otp_code, אותן עמודות כמו קוד הכניסה; המטרה בתוך הערך — קוד כניסה לא מאשר כסף ולהפך).
// יומן הפאנל: STEPUP_SENT, STEPUP_VERIFIED, STEPUP_LOCKED (נגמרו הניסיונות). הקוד לא נרשם בשום מקום.
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { otpRatelimit, otpTriesRatelimit } from "@/lib/ratelimit";
import { sendStepUpCode } from "@/lib/email";
import { maskEmail } from "@/lib/mask";
import { parseBody, stepUpActionSchema } from "@/lib/validation";
import {
  issueOtp, checkOtp, takeOtpTry, otpErrorText, OTP_EXHAUSTED_TEXT, OTP_UNAVAILABLE_TEXT, OTP_USED_TEXT,
} from "@/lib/otp";
import { issueStepUpToken, readCookie, sessionBinding, stepUpCookieHeader, PANEL_SESSION_COOKIE } from "@/lib/stepUp";
import { firstIp, READ_FAILED_TEXT } from "@/lib/moneyActions";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  const session = g.session;
  if (session.role === "viewer") return reply({ error: "אין לך פעולות שדורשות אישור כסף.", code: "forbidden" }, 403);

  const parsed = await parseBody(req, stepUpActionSchema);
  if (!parsed.ok) return parsed.response;
  const ip = firstIp(req.headers.get("x-forwarded-for"));
  const sid = sessionBinding(readCookie(req.headers.get("cookie"), PANEL_SESSION_COOKIE));
  if (!sid) return reply({ error: "החיבור לפאנל לא זוהה. התחברו מחדש.", code: "no_session" }, 401);

  if (parsed.data.action === "send") {
    let allowed = false;
    try { allowed = (await otpRatelimit.limit(`stepup-send:${session.id}`)).success === true; } catch { allowed = false; }
    if (!allowed) return reply({ error: "נשלחו יותר מדי קודים. נסו שוב בעוד 10 דקות.", code: "rate_limited" }, 429);
    if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "production") {
      console.error("[stepup] RESEND_API_KEY missing");
      return reply({ error: "שירות המייל אינו מוגדר. פנו למנהל המערכת.", code: "email_not_configured" }, 503);
    }

    const otp = issueOtp({ adminId: session.id, purpose: "money" });
    const { error } = await adminClient.from("panel_admins").update({ otp_code: otp.stored, otp_expires: otp.expiresAt }).eq("id", session.id);
    if (error) {
      console.error("[stepup] save failed");
      return reply({ error: "לא הצלחנו ליצור קוד. נסו שוב.", code: "write_failed" }, 503);
    }

    const sent = await sendStepUpCode(session.email, otp.code);
    if (!sent.ok) {
      console.error("[stepup] email failed");
      // פיתוח בלבד: הקוד חוזר למסך כדי לא להינעל (כמו בכניסה). ב-production — שגיאה, בלי הקוד.
      if (process.env.NODE_ENV !== "production") {
        return reply({ ok: true, sent_to: maskEmail(session.email), expires_at: otp.expiresAt, dev_code: otp.code });
      }
      return reply({ error: "שליחת הקוד במייל נכשלה. נסו שוב בעוד רגע.", code: "email_failed" }, 502);
    }
    await auditLog(session, "STEPUP_SENT", "panel_admin", session.id, { purpose: "money" }, ip);
    return reply({ ok: true, sent_to: maskEmail(session.email), expires_at: otp.expiresAt });
  }

  // ── verify ──
  const { data: row, error: readError } = await adminClient.from("panel_admins")
    .select("otp_code, otp_expires").eq("id", session.id).maybeSingle();
  if (readError) {
    console.error("[stepup] read failed");
    return reply({ error: READ_FAILED_TEXT, code: "read_failed" }, 503);
  }
  const code = parsed.data.code;
  const pre = checkOtp({ adminId: session.id, purpose: "money", code, stored: row?.otp_code, expiresAt: row?.otp_expires });
  if (pre === "format" || pre === "none" || pre === "other_purpose" || pre === "expired") {
    return reply({ error: otpErrorText(pre), code: pre === "other_purpose" ? "none" : pre }, 400);
  }
  const stored = row!.otp_code as string;
  const t = await takeOtpTry(otpTriesRatelimit, session.id, "money", stored);
  if (!t.ok) {
    if (t.reason === "unavailable") return reply({ error: OTP_UNAVAILABLE_TEXT, code: "unavailable" }, 503);
    await adminClient.from("panel_admins").update({ otp_code: null, otp_expires: null }).eq("id", session.id).eq("otp_code", stored);
    await auditLog(session, "STEPUP_LOCKED", "panel_admin", session.id, { purpose: "money" }, ip);
    return reply({ error: OTP_EXHAUSTED_TEXT, code: "too_many_tries" }, 429);
  }
  if (pre === "wrong") {
    if (t.remaining <= 0) {
      await adminClient.from("panel_admins").update({ otp_code: null, otp_expires: null }).eq("id", session.id).eq("otp_code", stored);
      await auditLog(session, "STEPUP_LOCKED", "panel_admin", session.id, { purpose: "money" }, ip);
    }
    return reply({ error: otpErrorText("wrong", t.remaining), code: "wrong", remaining: t.remaining }, 400);
  }

  // שימוש אחד: מנקים רק אם הערך השמור עוד זהה — שתי בקשות עם אותו קוד, רק אחת מקבלת אישור.
  const { data: used, error: useError } = await adminClient.from("panel_admins")
    .update({ otp_code: null, otp_expires: null }).eq("id", session.id).eq("otp_code", stored).select("id");
  if (useError) {
    console.error("[stepup] consume failed");
    return reply({ error: READ_FAILED_TEXT, code: "write_failed" }, 503);
  }
  if (!Array.isArray(used) || used.length === 0) return reply({ error: OTP_USED_TEXT, code: "used" }, 400);

  const tok = issueStepUpToken({ adminId: session.id, sid, purpose: "money", nowMs: Date.now() });
  await auditLog(session, "STEPUP_VERIFIED", "panel_admin", session.id, { purpose: "money", expires_at: tok.expiresAt }, ip);
  return reply({ ok: true, expires_at: tok.expiresAt }, 200, { "Set-Cookie": stepUpCookieHeader(tok.token, tok.maxAgeSec) });
}
