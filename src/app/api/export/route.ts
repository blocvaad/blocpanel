import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "tenants";
  const buildingId = searchParams.get("building_id") ?? "";

  let rows: string[] = [];
  let filename = "";

  if (type === "tenants") {
    let q = adminClient.from("panel_tenants_view").select("*").order("created_at", { ascending: false });
    if (buildingId) q = q.eq("building_id", buildingId);
    const { data } = await q;
    filename = `tenants_${new Date().toISOString().slice(0,10)}.csv`;
    rows = [
      ["שם מלא", "בניין", "דירה", "תפקיד", "סטטוס", "הצטרף"].join(","),
      ...(data ?? []).map(t => [
        t.full_name, t.building_name,
        t.hide_apartment ? "מוסתר" : t.apartment_display,
        t.role, t.approval_status,
        new Date(t.created_at).toLocaleDateString("he-IL"),
      ].map(v => `"${v}"`).join(","))
    ];
  } else if (type === "payments") {
    let q = adminClient.from("panel_payments_view").select("*").order("created_at", { ascending: false });
    if (buildingId) q = q.eq("building_id", buildingId);
    const { data } = await q;
    filename = `payments_${new Date().toISOString().slice(0,10)}.csv`;
    rows = [
      ["בניין", "דייר", "דירה", "סכום", "סטטוס", "תיאור", "תאריך"].join(","),
      ...(data ?? []).map(p => [
        p.building_name, p.tenant_name ?? "",
        p.apartment_display, p.amount,
        p.status, p.description ?? "",
        new Date(p.created_at).toLocaleDateString("he-IL"),
      ].map(v => `"${v}"`).join(","))
    ];
  } else if (type === "tickets") {
    let q = adminClient.from("panel_tickets_view").select("*").order("created_at", { ascending: false });
    if (buildingId) q = q.eq("building_id", buildingId);
    const { data } = await q;
    filename = `tickets_${new Date().toISOString().slice(0,10)}.csv`;
    rows = [
      ["כותרת", "בניין", "מדווח", "דירה", "עדיפות", "סטטוס", "תאריך"].join(","),
      ...(data ?? []).map(t => [
        t.title, t.building_name, t.reporter_name ?? "",
        t.apartment_display, t.priority ?? "", t.status,
        new Date(t.created_at).toLocaleDateString("he-IL"),
      ].map(v => `"${v}"`).join(","))
    ];
  }

  const csv = "\uFEFF" + rows.join("\n"); // BOM for Excel Hebrew support
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
