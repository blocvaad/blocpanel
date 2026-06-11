import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "superadmin") return NextResponse.json({ error: "נדרש superadmin" }, { status: 403 });
  const { id } = await params;
  const { full_name, role, is_active, password } = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const updates: Record<string, unknown> = {};
  if (full_name) updates.full_name = full_name;
  if (role) updates.role = role;
  if (typeof is_active === "boolean") updates.is_active = is_active;
  if (password && password.length >= 8) updates.password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await adminClient.from("panel_admins").update(updates).eq("id", id).select("id,email,full_name,role,is_active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog(session, "UPDATE_ADMIN", "panel_admin", id, { updates: Object.keys(updates) }, ip);
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "superadmin") return NextResponse.json({ error: "נדרש superadmin" }, { status: 403 });
  const { id } = await params;
  if (session.id === id) return NextResponse.json({ error: "לא ניתן למחוק את עצמך" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const { error } = await adminClient.from("panel_admins").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog(session, "DELETE_ADMIN", "panel_admin", id, {}, ip);
  return NextResponse.json({ ok: true });
}
