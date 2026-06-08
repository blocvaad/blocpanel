import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function genOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, code } = await req.json();

  if (action === "send") {
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await adminClient.from("panel_admins")
      .update({ otp_code: otp, otp_expires: expires })
      .eq("id", session.id);

    // Send email
    const { error } = await resend.emails.send({
      from: "blocpanel <onboarding@resend.dev>",
      to: "talyohala1@gmail.com",
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
      console.error("[2FA email error]", error);
      return NextResponse.json({ error: "שגיאה בשליחת מייל" }, { status: 500 });
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

    await adminClient.from("panel_admins")
      .update({ otp_code: null, otp_expires: null, last_2fa: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
}
