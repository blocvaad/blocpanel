import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const page=parseInt(searchParams.get("page")??"1"), pageSize=parseInt(searchParams.get("size")??"50"), from=(page-1)*pageSize;
  const { data, count, error } = await adminClient.from("panel_audit_logs").select("*",{count:"exact"}).order("created_at",{ascending:false}).range(from,from+pageSize-1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count??0, page, pageSize });
}
