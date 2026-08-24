import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  const { data } = await adminClient.from("panel_stats_view").select("*").single();
  return NextResponse.json({ data });
}
