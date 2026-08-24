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

  // ── ארכוב אטומי (P0.6/P0.13) ──
  // buildings.is_archived + חסימת כל הדיירים חייבים לקרות ביחד. קודם זו
  // הייתה שתי כתיבות נפרדות, והשנייה (חסימת דיירים) אף לא נבדקה לשגיאה —
  // כך שבניין יכול היה להישאר archived בעוד הדיירים עדיין approved (גישה).
  // ה-RPC עוטף את שתיהן בטרנזקציה אחת.
  const { data: rows, error } = await adminClient.rpc("admin_archive_building", {
    p_building_id: id,
    p_reason: reason,
  });

  if (error) {
    if ((error.message || "").includes("building_not_found"))
      return NextResponse.json({ error: "בניין לא נמצא" }, { status: 404 });
    console.error("[building archive]", error);
    return NextResponse.json({ error: "שגיאה בארכוב" }, { status: 500 });
  }

  const result = Array.isArray(rows) ? rows[0] : rows;

  await auditLog(session, "ARCHIVE_BUILDING", "building", id, {
    name: result?.building_name,
    blocked: result?.blocked_count,
    reason,
    note: "נתונים שמורים לפי GDPR — לא נמחקו"
  }, ip);

  return NextResponse.json({ ok: true, archived: true });
}
