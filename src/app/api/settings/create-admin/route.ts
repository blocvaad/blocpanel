import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role!=="superadmin") return NextResponse.json({ error: "נדרש superadmin" }, { status: 403 });
  const { email, full_name, password, role } = await req.json();
  if (!email||!full_name||!password||password.length<8) return NextResponse.json({ error: "נתונים חסרים" }, { status: 400 });
  const hash = await bcrypt.hash(password, 12);
  const { data, error } = await adminClient.from("panel_admins").insert({email:email.toLowerCase(),full_name,password_hash:hash,role}).select("id,email,full_name,role").single();
  if (error) { if(error.code==="23505") return NextResponse.json({error:"האימייל כבר קיים"},{status:409}); return NextResponse.json({error:error.message},{status:500}); }
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  await auditLog(session,"CREATE_ADMIN","panel_admin",data.id,{email,role},ip);
  return NextResponse.json({ data });
}
