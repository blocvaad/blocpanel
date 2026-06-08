import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { adminClient } from "@/lib/supabase";
import { signToken, hashToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "נדרש אימייל וסיסמה" }, { status: 400 });

    const { data: admin, error } = await adminClient
      .from("panel_admins")
      .select("id,email,password_hash,full_name,role,is_active")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (error || !admin) return NextResponse.json({ error: "פרטי כניסה שגויים" }, { status: 401 });
    if (!admin.is_active) return NextResponse.json({ error: "החשבון מושהה" }, { status: 403 });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return NextResponse.json({ error: "פרטי כניסה שגויים" }, { status: 401 });

    const payload = { id: admin.id, email: admin.email, full_name: admin.full_name, role: admin.role as "superadmin"|"admin"|"viewer" };
    const token = await signToken(payload);

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
    await adminClient.from("panel_sessions").insert({
      admin_id: admin.id, token_hash: hashToken(token),
      ip_address: ip, user_agent: req.headers.get("user-agent"),
      expires_at: new Date(Date.now() + 8*60*60*1000).toISOString(),
    });
    await adminClient.from("panel_admins").update({ last_login: new Date().toISOString() }).eq("id", admin.id);

    const response = NextResponse.json({ admin: payload });
    response.cookies.set("blocpanel_session", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
