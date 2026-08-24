import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, adminUpdateSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  const parsed = await parseBody(req, adminUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { full_name, role, is_active, password } = parsed.data;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const updates: Record<string, unknown> = {};
  if (full_name) updates.full_name = full_name;
  if (role) updates.role = role;
  if (typeof is_active === "boolean") updates.is_active = is_active;
  if (password) updates.password_hash = await bcrypt.hash(password, 12);
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });
  const { data, error } = await adminClient.from("panel_admins").update(updates).eq("id", id).select("id,email,full_name,role,is_active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog(session, "UPDATE_ADMIN", "panel_admin", id, { updates: Object.keys(updates) }, ip);
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  if (session.id === id) return NextResponse.json({ error: "לא ניתן למחוק את עצמך" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const { error } = await adminClient.from("panel_admins").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog(session, "DELETE_ADMIN", "panel_admin", id, {}, ip);
  return NextResponse.json({ ok: true });
}
