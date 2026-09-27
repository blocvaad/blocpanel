import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";
import { isMissingRpc } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export type DebtRow = {
  building_id: string; building_name: string;
  open_count: number; open_amount: number;
  approval_count: number; approval_amount: number;
  external_count: number; external_amount: number;
  oldest_open: string | null;
};

// GET /api/debt — חוב פתוח לפי בניין.
//
// מחושב ב-DB (panel_debt_by_building, 125): קודם כל התשלומים נמשכו לדפדפן
// וסוכמו ב-JS — מעל 1000 שורות (max_rows) הסכומים נחתכו בשקט. 'failed' אינו
// מצב קיים; external_pending (גבייה דרך חברת ניהול) מוצג בנפרד — bloc לא יודע
// אם שולם, ולכן זה לא "חוב".
export async function GET() {
  const g = await guard({ permission: "payments.read" });
  if (!g.ok) return g.response;

  const { data, error } = await adminClient.rpc("panel_debt_by_building");
  if (!error) {
    const rows = ((data ?? []) as DebtRow[]).map((r) => ({
      ...r,
      open_count: Number(r.open_count), open_amount: Number(r.open_amount),
      approval_count: Number(r.approval_count), approval_amount: Number(r.approval_amount),
      external_count: Number(r.external_count), external_amount: Number(r.external_amount),
    }));
    return NextResponse.json({ data: rows, source: "rpc" });
  }
  if (!isMissingRpc(error)) return NextResponse.json({ error: "שגיאה בטעינת חובות" }, { status: 500 });

  // 125 עוד לא רץ — החישוב הישן, מוגבל ומסומן כחלקי.
  const { data: payments } = await adminClient
    .from("payments")
    .select("amount, status, building_id, buildings(name)")
    .in("status", ["pending", "pending_approval", "external_pending"])
    .limit(1000);
  const by: Record<string, DebtRow> = {};
  for (const p of (payments ?? []) as Array<{ amount: number; status: string; building_id: string; buildings: { name?: string } | null }>) {
    const r = (by[p.building_id] ??= {
      building_id: p.building_id, building_name: p.buildings?.name ?? "לא ידוע",
      open_count: 0, open_amount: 0, approval_count: 0, approval_amount: 0, external_count: 0, external_amount: 0, oldest_open: null,
    });
    const amt = Number(p.amount) || 0;
    if (p.status === "pending") { r.open_count++; r.open_amount += amt; }
    else if (p.status === "pending_approval") { r.approval_count++; r.approval_amount += amt; }
    else { r.external_count++; r.external_amount += amt; }
  }
  const rows = Object.values(by).sort((a, b) => b.open_amount - a.open_amount);
  return NextResponse.json({ data: rows, source: "fallback", partial: (payments ?? []).length >= 1000 });
}
