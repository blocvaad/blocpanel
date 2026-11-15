// src/lib/stepUp.ts — אישור לפעולת כסף בפאנל (step-up, PANEL-PAY א1, החלטה 364, C4). שרת בלבד.
//
// אחרי קוד נכון (api/auth/stepup, purpose 'money' ב-lib/otp) השרת שם עוגייה חתומה, httpOnly, ל-10 דקות:
//   su1.<adminId>.<sid>.<purpose>.<expMs>.<sig>
//   sid  — 32 תווי hex מ-SHA-256 של עוגיית הסשן (blocpanel_session): האישור קשור לחיבור הזה. כניסה חדשה, או סשן אחר
//          של אותו מנהל — אישור חדש.
//   sig  — base64url בלי ריפוד (43 תווים) של HMAC-SHA256(מפתח-משנה 'stepup' של PANEL_JWT_SECRET,
//          "blocpanel/stepup/v1|<adminId>|<sid>|<purpose>|<expMs>"). מפתח-משנה נפרד מהסשן: אישור לא נבדק כסשן ולהפך.
// בלי מצב בשרת: בתוך 10 הדקות אותו אישור טוב לכמה פעולות (החלטה 364: "step-up valid 10 minutes").
//
// requireStepUp(session, req) — בכל route של פעולת כסף, אחרי guard ואחרי בדיקת הגוף, לפני הקריאה ל-bloc. בלי אישור
// תקף: 403 { code: 'stepup_required' } — המסך פותח את חלון הקוד (components/ui/StepUpDialog) ושולח שוב פעם אחת.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { panelSubkey } from "./panelSecret";
import { STEPUP_REQUIRED_CODE, STEPUP_REQUIRED_TEXT, STEPUP_TTL_MS } from "./stepUpShared";

export const STEPUP_COOKIE = "blocpanel_stepup";
/** שם עוגיית הסשן — אותו שם כמו ב-lib/auth וב-middleware (נעוץ בבדיקת wiring). */
export const PANEL_SESSION_COOKIE = "blocpanel_session";
export type StepUpPurpose = "money";
const SKEW_MS = 60_000;
const TOKEN_RE = /^su1\.([A-Za-z0-9-]{1,64})\.([0-9a-f]{32})\.([a-z]{1,16})\.(\d{13})\.([A-Za-z0-9_-]{43})$/;

function sign(key: Buffer, adminId: string, sid: string, purpose: string, expMs: string): string {
  return createHmac("sha256", key).update(`blocpanel/stepup/v1|${adminId}|${sid}|${purpose}|${expMs}`).digest("base64url");
}

/** הקשר לסשן: 32 תווי hex מ-SHA-256 של ערך עוגיית הסשן. אין עוגייה — null. */
export function sessionBinding(sessionToken: string | null | undefined): string | null {
  if (!sessionToken) return null;
  return createHash("sha256").update(`blocpanel/stepup-session|${sessionToken}`).digest("hex").slice(0, 32);
}

/** אישור חדש למנהל, לסשן ולמטרה — תקף 10 דקות מעכשיו. */
export function issueStepUpToken(p: { adminId: string; sid: string; purpose?: StepUpPurpose; nowMs: number; key?: Buffer }): {
  token: string; expiresAt: string; maxAgeSec: number;
} {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(p.adminId)) throw new Error("bad admin id");
  if (!/^[0-9a-f]{32}$/.test(p.sid)) throw new Error("bad session binding");
  const purpose = p.purpose ?? "money";
  const exp = String(Math.trunc(p.nowMs + STEPUP_TTL_MS)).padStart(13, "0");
  const sig = sign(p.key ?? panelSubkey("stepup"), p.adminId, p.sid, purpose, exp);
  return { token: `su1.${p.adminId}.${p.sid}.${purpose}.${exp}.${sig}`, expiresAt: new Date(Number(exp)).toISOString(), maxAgeSec: STEPUP_TTL_MS / 1000 };
}

/** מה פסל את האישור — לבדיקות; התשובה ללקוח תמיד אחת (stepup_required). */
export type StepUpCheck = "ok" | "missing" | "format" | "signature" | "admin" | "session" | "purpose" | "expired" | "future";

export function checkStepUpToken(p: {
  token: string | null | undefined; adminId: string; sid: string | null; purpose: StepUpPurpose; nowMs: number; key?: Buffer;
}): StepUpCheck {
  if (!p.token) return "missing";
  const m = TOKEN_RE.exec(p.token);
  if (!m) return "format";
  const [, adminId, sid, purpose, exp, sig] = m;
  // החתימה קודם: ערך ששונה (מנהל, סשן, מטרה או תוקף) נפסל כחתימה — לא משנה איזה שדה נגעו בו.
  const want = Buffer.from(sign(p.key ?? panelSubkey("stepup"), adminId, sid, purpose, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "signature";
  if (adminId !== p.adminId) return "admin";
  if (!p.sid || sid !== p.sid) return "session";
  if (purpose !== p.purpose) return "purpose";
  const expMs = Number(exp);
  if (expMs <= p.nowMs) return "expired";
  if (expMs > p.nowMs + STEPUP_TTL_MS + SKEW_MS) return "future";
  return "ok";
}

/** ערך עוגייה מכותרת Cookie (או null). */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    const v = part.slice(i + 1).trim();
    try { return decodeURIComponent(v); } catch { return v; }
  }
  return null;
}

/** Set-Cookie לאישור: httpOnly, SameSite=Strict, כל הנתיבים, 10 דקות; Secure ב-production. */
export function stepUpCookieHeader(token: string, maxAgeSec: number, secure: boolean = process.env.NODE_ENV === "production"): string {
  return `${STEPUP_COOKIE}=${token}; Path=/; Max-Age=${Math.max(0, Math.trunc(maxAgeSec))}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

type ReqLike = { headers: { get(name: string): string | null } };

/** האישור מהבקשה מול המנהל והסשן שלה. */
export function stepUpState(session: { id: string }, req: ReqLike, nowMs: number = Date.now()): StepUpCheck {
  const cookies = req.headers.get("cookie");
  return checkStepUpToken({
    token: readCookie(cookies, STEPUP_COOKIE),
    adminId: session.id,
    sid: sessionBinding(readCookie(cookies, PANEL_SESSION_COOKIE)),
    purpose: "money",
    nowMs,
  });
}

/** שער לפעולת כסף: אישור תקף (אותו מנהל, אותו סשן, 'money', פחות מ-10 דקות) — או 403 stepup_required. */
export function requireStepUp(session: { id: string }, req: ReqLike, nowMs: number = Date.now()):
  { ok: true } | { ok: false; reason: StepUpCheck; response: NextResponse } {
  const reason = stepUpState(session, req, nowMs);
  if (reason === "ok") return { ok: true };
  return {
    ok: false, reason,
    response: NextResponse.json({ error: STEPUP_REQUIRED_TEXT, code: STEPUP_REQUIRED_CODE }, { status: 403, headers: { "Cache-Control": "no-store" } }),
  };
}
