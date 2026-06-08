import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const page=parseInt(searchParams.get("page")??"1"), pageSize=parseInt(searchParams.get("size")??"25"), search=searchParams.get("q")??"", status=searchParams.get("status")??"", buildingId=searchParams.get("building_id")??"", from=(page-1)*pageSize;
  let query = adminClient.from("panel_tenants_view").select("*",{count:"exact"}).order("created_at",{ascending:false}).range(from,from+pageSize-1);
  if (search) query = query.ilike("full_name",`%${search}%`);
  if (status) query = query.eq("approval_status",status);
  if (buildingId) query = query.eq("building_id",buildingId);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count??0, page, pageSize });
}
