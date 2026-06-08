import { NextRequest, NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const { data, error } = await adminClient
    .from("buildings").update(body).eq("id", id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog(session, "UPDATE_BUILDING", "building", id, { changes: body }, ip);
  return NextResponse.json({ data });
}

// DELETE = suspend only, never hard delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "superadmin") return NextResponse.json({ error: "נדרש superadmin" }, { status: 403 });

  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  // Get building info for audit
  const { data: building } = await adminClient
    .from("buildings").select("name").eq("id", id).single();

  // SUSPEND only — block all tenants & mark building
  // We do NOT hard delete — only manual DB action allowed
  const { error } = await adminClient
    .from("profiles")
    .update({ approval_status: "blocked" })
    .eq("building_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(session, "SUSPEND_BUILDING", "building", id, {
    name: building?.name,
    note: "חסם את כל דיירי הבניין — מחיקה ידנית נדרשת מ-Supabase"
  }, ip);

  return NextResponse.json({ ok: true, suspended: true });
}
