import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const { searchParams } = new URL(req.url);
  const building_id = searchParams.get("building_id");

  let q = adminClient.from("panel_tenants_view").select("*").order("full_name");
  if (building_id) q = q.eq("building_id", building_id);

  const { data, count } = await q;
  return NextResponse.json({ data: data ?? [], count });
}
