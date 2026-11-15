import { otpRatelimit, otpTriesRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionToken, signToken, hashToken, setSessionCookie } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { send2FACode } from "@/lib/email";
import { PANEL_SESSION_CODE } from "@/lib/panelSession";
import {
  issueOtp, checkOtp, takeOtpTry, otpErrorText, OTP_EXHAUSTED_TEXT, OTP_UNAVAILABLE_TEXT, OTP_USED_TEXT,
} from "@/lib/otp";
import { firstIp } from "@/lib/moneyActions";

// קוד הכניסה (2FA) — S546 / PANEL-PAY א1 (החלטה 364): אותו מודול כמו האישור לפעולת כסף (lib/otp). crypto.randomInt,
// נשמר רק HMAC (קשור למנהל ולמטרה 'login'), השוואה timing-safe, שימוש אחד (ניקוי בתנאי שהערך עוד זהה), 10 דקות, ועד 5
// ניסיונות לקוד (otpTriesRatelimit). המגביל של IP (otpRatelimit, 3 ל-10 דקות לפעולה) נשאר כמו שהיה.

export async function POST(req: NextRequest) {
  // A pre-MFA (or full) session identifies which admin we're challenging.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "הכניסה פגה. התחברו שוב עם הסיסמה.", code: PANEL_SESSION_CODE }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { action?: unknown; code?: unknown } | null;
  const action = body?.action;
  const code = typeof body?.code === "string" ? body.code.trim() : body?.code;

  // Rate limit OTP attempts
  const ip = firstIp(req.headers.get("x-forwarded-for")) ?? "unknown";
  const { success } = await otpRatelimit.limit(`${ip}:${String(action)}`);
  if (!success) {
    return NextResponse.json({ error: "יותר מדי ניסיונות. נסה שוב בעוד 10 דקות." }, { status: 429 });
  }

  if (action === "send") {
    if (!process.env.RESEND_API_KEY) {
      console.error("[2FA] RESEND_API_KEY missing");
      return NextResponse.json({ error: "שירות המייל אינו מוגדר. פנה למנהל המערכת." }, { status: 500 });
    }

    const otp = issueOtp({ adminId: session.id, purpose: "login" });
    const { error: saveError } = await adminClient.from("panel_admins")
      .update({ otp_code: otp.stored, otp_expires: otp.expiresAt })
      .eq("id", session.id);
    if (saveError) {
      console.error("[2FA] save failed");
      return NextResponse.json({ error: "לא הצלחנו ליצור קוד. נסו שוב." }, { status: 503 });
    }

    // נמען הקוד: תמיד המייל של האדמין המחובר עצמו (session.email). זו ההתנהגות
    // הנכונה — כל אדמין פאנל מקבל את הקוד שלו לכתובת שלו.
    // PANEL_2FA_FALLBACK_EMAIL קיים רק כרשת ביטחון לפיתוח (למשל אם הדומיין
    // עדיין לא מאומת בסביבת dev). ב-production הוא נחסם לחלוטין, כך ששום
    // הגדרה שגויה לא תפנה קודים של אדמין אחד לתיבה של מישהו אחר.
    const fallback = process.env.NODE_ENV !== "production"
      ? process.env.PANEL_2FA_FALLBACK_EMAIL
      : undefined;
    const recipient = fallback || session.email;

    const result = await send2FACode(recipient, otp.code);

    if (!result.ok) {
      console.error("[2FA email error]", result.error);

      // רשת ביטחון לפיתוח בלבד: אם השליחה נכשלה, מחזירים קוד כדי לא להינעל.
      // כבוי לגמרי ב-production (אין דליפת קוד).
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[2FA][dev] email failed — OTP for ${session.email}: ${otp.code}`);
        return NextResponse.json({ ok: true, dev_otp: otp.code, dev_note: "email failed; using dev OTP" });
      }

      const msg = result.error || "";
      const hint = /testing|verify a domain|own email address|not verified/i.test(msg)
        ? "בעיית דומיין ב-Resend. ודא ש-RESEND_FROM מצביע לכתובת @blocvaad.co.il מאומתת."
        : "שגיאה בשליחת מייל. בדוק את הגדרות Resend.";
      return NextResponse.json({ error: hint }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    const { data: admin, error: readError } = await adminClient.from("panel_admins")
      .select("otp_code, otp_expires").eq("id", session.id).single();
    if (readError) {
      console.error("[2FA] read failed");
      return NextResponse.json({ error: "לא הצלחנו לבדוק את הקוד. נסו שוב." }, { status: 503 });
    }

    const pre = checkOtp({ adminId: session.id, purpose: "login", code, stored: admin?.otp_code, expiresAt: admin?.otp_expires });
    if (pre === "format" || pre === "none" || pre === "other_purpose" || pre === "expired") {
      return NextResponse.json({ error: otpErrorText(pre), code: pre }, { status: 400 });
    }
    const stored = admin!.otp_code as string;
    const t = await takeOtpTry(otpTriesRatelimit, session.id, "login", stored);
    if (!t.ok) {
      if (t.reason === "unavailable") return NextResponse.json({ error: OTP_UNAVAILABLE_TEXT, code: "unavailable" }, { status: 503 });
      await adminClient.from("panel_admins").update({ otp_code: null, otp_expires: null }).eq("id", session.id).eq("otp_code", stored);
      return NextResponse.json({ error: OTP_EXHAUSTED_TEXT, code: "too_many_tries" }, { status: 429 });
    }
    if (pre === "wrong") {
      if (t.remaining <= 0) {
        await adminClient.from("panel_admins").update({ otp_code: null, otp_expires: null }).eq("id", session.id).eq("otp_code", stored);
      }
      return NextResponse.json({ error: otpErrorText("wrong", t.remaining), code: "wrong", remaining: t.remaining }, { status: 400 });
    }

    const verifiedAt = new Date().toISOString();

    // Clear the OTP + stamp last_2fa — only if it is still the same code (single use: two requests with one code, one wins).
    const { data: used, error: useError } = await adminClient.from("panel_admins")
      .update({ otp_code: null, otp_expires: null, last_2fa: verifiedAt })
      .eq("id", session.id).eq("otp_code", stored)
      .select("id");
    if (useError) {
      console.error("[2FA] consume failed");
      return NextResponse.json({ error: "לא הצלחנו לבדוק את הקוד. נסו שוב." }, { status: 503 });
    }
    if (!Array.isArray(used) || used.length === 0) return NextResponse.json({ error: OTP_USED_TEXT, code: "used" }, { status: 400 });

    // ── MFA passed → mint the FULL session (audit P0.2). ──
    // Rotate the token: the old pre_mfa session row is revoked and a fresh
    // full-assurance token replaces the cookie. Token rotation on privilege
    // escalation prevents fixation on the pre-MFA token.
    const oldToken = await getSessionToken();
    const fullToken = await signToken(
      { id: session.id, email: session.email, full_name: session.full_name, role: session.role },
      "mfa",
      verifiedAt
    );

    await adminClient.from("panel_sessions").insert({
      admin_id: session.id, token_hash: hashToken(fullToken),
      // S988: הכתובת הראשונה ב-X-Forwarded-For (רשימה עם פסיקים לא נכנסת לעמודת INET).
      ip_address: firstIp(req.headers.get("x-forwarded-for")) ?? req.headers.get("x-real-ip"),
      user_agent: req.headers.get("user-agent"),
      auth_level: "mfa", mfa_verified_at: verifiedAt,
      expires_at: new Date(Date.now() + 8*60*60*1000).toISOString(),
    });

    // Revoke the pre-MFA session row so its token can't be reused.
    if (oldToken) {
      await adminClient.from("panel_sessions")
        .update({ revoked_at: verifiedAt })
        .eq("token_hash", hashToken(oldToken));
    }

    await setSessionCookie(fullToken);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
}
