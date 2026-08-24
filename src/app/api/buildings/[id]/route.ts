import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, buildingUpdateSchema, buildingArchiveSchema } from "@/lib/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard();
  if (!g.ok) return g.response;
  const { id } = await params;
  const { data, error } = await adminClient.from("buildings").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ permission: "buildings.modify" });
  if (!g.ok) return g.response;
  const session = g.session;
  const { id } = await params;
  const parsed = await parseBody(req, buildingUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
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
  const g = await guard({ role: "superadmin" });
  if (!g.ok) return g.response;
  const session = g.session;

  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const parsed = await parseBody(req, buildingArchiveSchema);
  if (!parsed.ok) return parsed.response;
  const reason = parsed.data.reason ?? "הושהה על ידי מנהל מערכת";

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
