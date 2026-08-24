import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const { data: payments } = await adminClient
    .from("payments")
    .select("amount, status, building_id, buildings(name)")
    .in("status", ["pending", "pending_approval", "failed"]);

  const byBuilding: Record<string, { name: string; total: number; count: number }> = {};

  for (const p of payments ?? []) {
    const id = p.building_id;
    const name = (p.buildings as any)?.name ?? "לא ידוע";
    if (!byBuilding[id]) byBuilding[id] = { name, total: 0, count: 0 };
    byBuilding[id].total += p.amount ?? 0;
    byBuilding[id].count++;
  }

  const result = Object.entries(byBuilding)
    .map(([id, v]) => ({ building_id: id, ...v }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ data: result });
}
