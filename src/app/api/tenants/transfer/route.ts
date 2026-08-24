import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "tenants.modify" });
  if (!g.ok) return g.response;
  const session = g.session;

  const { tenant_id, to_building_id, new_apartment } = await req.json();
  if (!tenant_id || !to_building_id) return NextResponse.json({ error: "חסרים שדות" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const { data: tenant } = await adminClient.from("profiles").select("full_name,building_id").eq("id", tenant_id).single();

  const update: Record<string, unknown> = { building_id: to_building_id, approval_status: "pending" };
  if (new_apartment) update.apartment = new_apartment;

  const { error } = await adminClient.from("profiles").update(update).eq("id", tenant_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(session, "TRANSFER_TENANT", "tenant", tenant_id, {
    name: tenant?.full_name,
    from: tenant?.building_id,
    to: to_building_id,
  }, ip);

  return NextResponse.json({ ok: true });
}
