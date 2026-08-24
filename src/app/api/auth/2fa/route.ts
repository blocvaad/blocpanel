import { otpRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionToken, signToken, hashToken, setSessionCookie } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { send2FACode } from "@/lib/email";

function genOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

export async function POST(req: NextRequest) {
  // A pre-MFA (or full) session identifies which admin we're challenging.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, code } = await req.json();

  // Rate limit OTP attempts
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { success } = await otpRatelimit.limit(`${ip}:${action}`);
  if (!success) {
    return NextResponse.json({ error: "יותר מדי ניסיונות. נסה שוב בעוד 10 דקות." }, { status: 429 });
  }

  if (action === "send") {
    if (!process.env.RESEND_API_KEY) {
      console.error("[2FA] RESEND_API_KEY missing");
      return NextResponse.json({ error: "שירות המייל אינו מוגדר. פנה למנהל המערכת." }, { status: 500 });
    }

    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await adminClient.from("panel_admins")
      .update({ otp_code: otp, otp_expires: expires })
      .eq("id", session.id);

    // נמען הקוד: כברירת מחדל המייל של האדמין המחובר. הדומיין blocvaad.co.il
    // מאומת ב-Resend (בדיוק כמו ב-bloc), ולכן שליחה לכל כתובת עובדת.
    // PANEL_2FA_FALLBACK_EMAIL נשאר כאופציה להפניית כל הקודים לכתובת אחת אם צריך.
    const recipient = process.env.PANEL_2FA_FALLBACK_EMAIL || session.email;

    const result = await send2FACode(recipient, otp);

    if (!result.ok) {
      console.error("[2FA email error]", result.error);

      // רשת ביטחון לפיתוח בלבד: אם השליחה נכשלה, מחזירים קוד כדי לא להינעל.
      // כבוי לגמרי ב-production (אין דליפת קוד).
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[2FA][dev] email failed — OTP for ${session.email}: ${otp}`);
        return NextResponse.json({ ok: true, dev_otp: otp, dev_note: "email failed; using dev OTP" });
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
    const { data: admin } = await adminClient.from("panel_admins")
      .select("otp_code, otp_expires").eq("id", session.id).single();

    if (!admin?.otp_code || !admin?.otp_expires)
      return NextResponse.json({ error: "לא נשלח קוד" }, { status: 400 });
    if (new Date(admin.otp_expires) < new Date())
      return NextResponse.json({ error: "הקוד פג תוקף" }, { status: 400 });
    if (admin.otp_code !== code)
      return NextResponse.json({ error: "קוד שגוי" }, { status: 400 });

    const verifiedAt = new Date().toISOString();

    // Clear the OTP + stamp last_2fa.
    await adminClient.from("panel_admins")
      .update({ otp_code: null, otp_expires: null, last_2fa: verifiedAt })
      .eq("id", session.id);

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
      ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
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
