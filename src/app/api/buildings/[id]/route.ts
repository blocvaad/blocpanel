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
  const { data, error } = await adminClient.from("buildings").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog(session, "UPDATE_BUILDING", "building", id, { changes: body }, ip);
  return NextResponse.json({ data });
}

// Archive building - legal compliant, data preserved
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "superadmin") return NextResponse.json({ error: "נדרש superadmin" }, { status: 403 });

  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason ?? "הושהה על ידי מנהל מערכת";

  const { data: building } = await adminClient.from("buildings").select("name").eq("id", id).single();

  // 1. Archive building
  const { error } = await adminClient.from("buildings").update({
    is_archived: true,
    archived_at: new Date().toISOString(),
    archived_reason: reason,
  }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Block all tenants
  await adminClient.from("profiles")
    .update({ approval_status: "blocked" })
    .eq("building_id", id);

  await auditLog(session, "ARCHIVE_BUILDING", "building", id, {
    name: building?.name,
    reason,
    note: "נתונים שמורים לפי GDPR — לא נמחקו"
  }, ip);

  return NextResponse.json({ ok: true, archived: true });
}
