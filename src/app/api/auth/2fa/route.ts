import { otpRatelimit } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionToken, signToken, hashToken, setSessionCookie } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // נמען הקוד: כברירת מחדל המייל של האדמין המחובר. אבל אם Resend עדיין על
    // דומיין הבדיקה (onboarding@resend.dev), הוא שולח רק לכתובת בעל החשבון —
    // אז אפשר להפנות את כל קודי ה-2FA לכתובת מאושרת אחת דרך PANEL_2FA_FALLBACK_EMAIL
    // עד שיוגדר דומיין מאומת. זה לא פוגע באבטחה: הקוד עדיין תקף רק ל-session.id הזה.
    const recipient = process.env.PANEL_2FA_FALLBACK_EMAIL || session.email;

    // Send email
    const { error } = await resend.emails.send({
      from: process.env.PANEL_EMAIL_FROM ?? "blocpanel <onboarding@resend.dev>",
      to: [recipient],
      subject: `קוד אימות blocpanel: ${otp}`,
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#09090b;color:#fafafa;border-radius:12px;">
          <div style="font-size:22px;font-weight:900;margin-bottom:8px;letter-spacing:-.03em;">blocpanel</div>
          <div style="font-size:13px;color:#71717a;margin-bottom:28px;">ניהול מרכזי</div>
          <div style="font-size:14px;color:#a1a1aa;margin-bottom:16px;">קוד האימות שלך לכניסה:</div>
          <div style="font-size:42px;font-weight:900;letter-spacing:.15em;font-family:monospace;background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;text-align:center;color:#fafafa;">
            ${otp}
          </div>
          <div style="font-size:12px;color:#52525b;margin-top:20px;text-align:center;">
            תוקף הקוד: 10 דקות · אל תשתף קוד זה עם אף אחד
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[2FA email error]", JSON.stringify(error));

      // Dev/staging safety valve: never lock the operator out because email
      // delivery failed. Outside production, surface the code so login can
      // proceed. NEVER active in production (guarded by NODE_ENV).
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[2FA][dev] email failed — OTP for ${session.email}: ${otp}`);
        return NextResponse.json({ ok: true, dev_otp: otp, dev_note: "email failed; using dev OTP" });
      }

      const msg = (error as { message?: string })?.message || "";
      // Resend test domain (onboarding@resend.dev) שולח רק לכתובת בעל החשבון.
      const hint = /testing|verify a domain|own email address/i.test(msg)
        ? "Resend עדיין על דומיין בדיקה — שולח רק לכתובת בעל החשבון. הגדר PANEL_2FA_FALLBACK_EMAIL או דומיין מאומת ב-PANEL_EMAIL_FROM."
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
