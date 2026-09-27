import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { toCsv } from "@/lib/csv";
import { paymentStatusLabel, METHOD_LABEL } from "@/lib/paymentStatus";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "tenants";
  // הרשאה לפי סוג הנתונים — כמו המסכים עצמם.
  const g = await guard({ permission: type === "payments" ? "payments.read" : type === "tenants" ? "tenants.read" : "buildings.read" });
  if (!g.ok) return g.response;
  const buildingId = searchParams.get("building_id") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "");

  let csv = "";
  let filename = "";
  if (type === "tenants") {
    let q = adminClient.from("panel_tenants_view").select("*").order("created_at", { ascending: false }).limit(20000);
    if (buildingId) q = q.eq("building_id", buildingId);
    const { data } = await q;
    filename = `tenants_${day}.csv`;
    csv = toCsv(["שם מלא", "בניין", "דירה", "תפקיד", "סטטוס", "הצטרף"], (data ?? []).map((t) => [
      t.full_name, t.building_name, t.hide_apartment ? "מוסתר" : t.apartment_display, t.role, t.approval_status, date(t.created_at),
    ]));
  } else if (type === "payments") {
    let q = adminClient.from("panel_payments_view").select("*").order("created_at", { ascending: false }).limit(20000);
    if (buildingId) q = q.eq("building_id", buildingId);
    const { data } = await q;
    filename = `payments_${day}.csv`;
    csv = toCsv(["בניין", "דייר", "דירה", "סכום", "סטטוס", "שיטה", "תיאור", "נוצר", "שולם"], (data ?? []).map((p) => [
      p.building_name, p.tenant_name ?? "", p.apartment_display, Number(p.amount), paymentStatusLabel(p.status),
      p.payment_method ? (METHOD_LABEL[p.payment_method] ?? p.payment_method) : "", p.description ?? "", date(p.created_at), date(p.due_date),
    ]));
  } else if (type === "tickets") {
    let q = adminClient.from("panel_tickets_view").select("*").order("created_at", { ascending: false }).limit(20000);
    if (buildingId) q = q.eq("building_id", buildingId);
    const { data } = await q;
    filename = `tickets_${day}.csv`;
    csv = toCsv(["כותרת", "בניין", "מדווח", "דירה", "עדיפות", "סטטוס", "תאריך"], (data ?? []).map((t) => [
      t.title, t.building_name, t.reporter_name ?? "", t.apartment_display, t.priority ?? "", t.status, date(t.created_at),
    ]));
  } else {
    return NextResponse.json({ error: "סוג ייצוא לא מוכר" }, { status: 400 });
  }

  await auditLog(g.session, "EXPORT_DATA", "export", type, { building_id: buildingId || null }, req.headers.get("x-forwarded-for") ?? undefined);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
