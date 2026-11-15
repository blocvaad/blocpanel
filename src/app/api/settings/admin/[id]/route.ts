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
  // S988 (החלטה 365): שינוי תפקיד / הפעלה נרשם "מה היה → מה נהיה". בלי המצב הקודם — לא משנים (יומן בלי "לפני" על מתן
  // הרשאות הוא חור), ואומרים שלא השתנה דבר.
  const { data: before, error: readError } = await adminClient.from("panel_admins").select("id, role, is_active").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: "לא הצלחנו לבדוק — שום דבר לא השתנה. נסו שוב." }, { status: 503 });
  if (!before) return NextResponse.json({ error: "המנהל לא נמצא" }, { status: 404 });
  const { data, error } = await adminClient.from("panel_admins").update(updates).eq("id", id).select("id,email,full_name,role,is_active").single();
  if (error) {
    console.error("[settings admin update]", error);
    return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  }
  await auditLog(session, "UPDATE_ADMIN", "panel_admin", id, {
    updates: Object.keys(updates),
    ...(role && role !== before.role ? { role: { from: before.role ?? null, to: role } } : {}),
    ...(typeof is_active === "boolean" && is_active !== before.is_active ? { is_active: { from: before.is_active ?? null, to: is_active } } : {}),
  }, ip);
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
