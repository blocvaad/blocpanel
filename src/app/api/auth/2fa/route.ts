import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

// Generate 6-digit OTP
function genOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, code } = await req.json();

  if (action === "send") {
    const otp = genOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    await adminClient.from("panel_admins")
      .update({ otp_code: otp, otp_expires: expires })
      .eq("id", session.id);

    // In production: send via email/SMS
    // For now: store and return (admin sees it in logs)
    console.log(`[2FA OTP] ${session.email}: ${otp}`);

    return NextResponse.json({ ok: true, dev_otp: process.env.NODE_ENV === "development" ? otp : undefined });
  }

  if (action === "verify") {
    const { data: admin } = await adminClient.from("panel_admins")
      .select("otp_code, otp_expires").eq("id", session.id).single();

    if (!admin?.otp_code || !admin?.otp_expires) {
      return NextResponse.json({ error: "לא נשלח קוד" }, { status: 400 });
    }
    if (new Date(admin.otp_expires) < new Date()) {
      return NextResponse.json({ error: "הקוד פג תוקף" }, { status: 400 });
    }
    if (admin.otp_code !== code) {
      return NextResponse.json({ error: "קוד שגוי" }, { status: 400 });
    }

    // Clear OTP
    await adminClient.from("panel_admins")
      .update({ otp_code: null, otp_expires: null, last_2fa: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "פעולה לא ידועה" }, { status: 400 });
}
