// src/lib/otp.ts — קוד חד-פעמי בן 6 ספרות לפאנל (S546, PANEL-PAY א1, החלטה 364).
//
// אותו מודול לשני שימושים: קוד הכניסה (2FA, api/auth/2fa — purpose 'login') והאישור לפעולת כסף (step-up,
// api/auth/stepup — purpose 'money').
//   • הקוד: crypto.randomInt (לא Math.random), 000000–999999.
//   • נשמר רק HMAC: panel_admins.otp_code = "o1.<purpose>.<hex>", כאשר hex = HMAC-SHA256(מפתח-משנה 'otp' של
//     PANEL_JWT_SECRET, "blocpanel/otp/v1|<purpose>|<adminId>|<code>"). הקוד עצמו לא נשמר בשום מקום. ה-HMAC קשור למנהל
//     ולמטרה: קוד כניסה לא מאשר פעולת כסף, וקוד של מנהל אחד לא עובד לאחר.
//   • השוואה: timingSafeEqual על אורך קבוע.
//   • 10 דקות (otp_expires), שימוש אחד (ה-route מנקה את השורה רק אם הערך השמור עוד זהה — CAS: שתי בקשות עם אותו קוד,
//     רק אחת מצליחה),
//     ועד 5 ניסיונות לקוד (lib/ratelimit otpTriesRatelimit — המפתח קשור לקוד הזה, כך שקוד חדש מקבל ניסיונות חדשים).
//     כשל של מגביל הניסיונות — נכשלים סגור (שום קוד לא נבדק בלי ספירה).
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { panelSubkey } from "./panelSecret";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_TRIES = 5;
export const OTP_PURPOSES = ["login", "money"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

const CODE_RE = /^\d{6}$/;
const STORED_RE = /^o1\.(login|money)\.([0-9a-f]{64})$/;

/** קוד בן 6 ספרות מ-crypto.randomInt (אפסים מובילים נשמרים). */
export function generateOtpCode(rand: (min: number, max: number) => number = randomInt): string {
  return String(rand(0, 1_000_000)).padStart(6, "0");
}

function mac(key: Buffer, adminId: string, purpose: OtpPurpose, code: string): string {
  return createHmac("sha256", key).update(`blocpanel/otp/v1|${purpose}|${adminId}|${code}`).digest("hex");
}

/** הערך שנשמר ב-panel_admins.otp_code: המטרה וה-HMAC — אף פעם לא הקוד. */
export function otpStoredValue(adminId: string, purpose: OtpPurpose, code: string, key: Buffer = panelSubkey("otp")): string {
  return `o1.${purpose}.${mac(key, adminId, purpose, code)}`;
}

/** קוד חדש: מה שולחים במייל (code), מה שומרים (stored) ועד מתי (expiresAt, ISO). */
export function issueOtp(p: { adminId: string; purpose: OtpPurpose; nowMs?: number; key?: Buffer; rand?: (min: number, max: number) => number }): {
  code: string; stored: string; expiresAt: string;
} {
  const code = generateOtpCode(p.rand);
  const now = p.nowMs ?? Date.now();
  return { code, stored: otpStoredValue(p.adminId, p.purpose, code, p.key), expiresAt: new Date(now + OTP_TTL_MS).toISOString() };
}

/** למה קוד לא התקבל — ל-route (הודעה בעברית) ולבדיקות. */
export type OtpCheck = "ok" | "format" | "none" | "other_purpose" | "expired" | "wrong";

export function checkOtp(p: {
  adminId: string; purpose: OtpPurpose; code: unknown; stored: unknown; expiresAt: unknown; nowMs?: number; key?: Buffer;
}): OtpCheck {
  if (typeof p.code !== "string" || !CODE_RE.test(p.code)) return "format";
  const m = typeof p.stored === "string" ? STORED_RE.exec(p.stored) : null;
  if (!m) return "none";
  if (m[1] !== p.purpose) return "other_purpose";
  const exp = typeof p.expiresAt === "string" ? Date.parse(p.expiresAt) : NaN;
  if (!Number.isFinite(exp) || exp <= (p.nowMs ?? Date.now())) return "expired";
  const want = Buffer.from(mac(p.key ?? panelSubkey("otp"), p.adminId, p.purpose, p.code), "hex");
  const got = Buffer.from(m[2], "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? "ok" : "wrong";
}

/** המפתח של מגביל הניסיונות לקוד הזה: מנהל + מטרה + טביעה של הערך השמור (קוד חדש = מפתח חדש). */
export function otpTriesKey(adminId: string, purpose: OtpPurpose, stored: string): string {
  return `${purpose}:${adminId}:${stored.slice(-24)}`;
}

export type TriesLimiter = { limit: (key: string) => Promise<{ success: boolean; remaining?: number }> };
export type OtpTry = { ok: true; remaining: number } | { ok: false; reason: "exhausted" | "unavailable" };

/** ניסיון אחד מתוך 5 לקוד הזה. המגביל נכשל — "unavailable" (סגור: לא בודקים קוד בלי לספור). */
export async function takeOtpTry(limiter: TriesLimiter, adminId: string, purpose: OtpPurpose, stored: string): Promise<OtpTry> {
  try {
    const r = await limiter.limit(otpTriesKey(adminId, purpose, stored));
    if (!r || r.success !== true) return { ok: false, reason: "exhausted" };
    const remaining = typeof r.remaining === "number" && Number.isFinite(r.remaining) ? Math.max(0, Math.min(OTP_MAX_TRIES - 1, r.remaining)) : 0;
    return { ok: true, remaining };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** ההודעה למסך לכל תוצאה שאינה ok (עברית, בלי לחשוף את הקוד או את הערך השמור). */
export function otpErrorText(c: Exclude<OtpCheck, "ok">, remaining?: number): string {
  if (c === "format") return "הקוד הוא 6 ספרות.";
  if (c === "none" || c === "other_purpose") return "לא נשלח קוד, או שהוא כבר שומש. שלחו קוד חדש.";
  if (c === "expired") return "הקוד פג תוקף (10 דקות). שלחו קוד חדש.";
  if (remaining === undefined) return "הקוד שגוי.";
  if (remaining <= 0) return "הקוד שגוי, ונגמרו הניסיונות לקוד הזה. שלחו קוד חדש.";
  return remaining === 1 ? "הקוד שגוי. נשאר ניסיון אחד." : `הקוד שגוי. נשארו ${remaining} ניסיונות.`;
}

export const OTP_EXHAUSTED_TEXT = "נגמרו הניסיונות לקוד הזה. שלחו קוד חדש.";
export const OTP_UNAVAILABLE_TEXT = "לא הצלחנו לבדוק את הקוד כרגע. נסו שוב בעוד רגע.";
export const OTP_USED_TEXT = "הקוד כבר שומש. שלחו קוד חדש.";
