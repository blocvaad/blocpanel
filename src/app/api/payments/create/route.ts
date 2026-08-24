import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, paymentCreateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "payments.create" });
  if (!g.ok) return g.response;
  const session = g.session;

  const p = await parseBody(req, paymentCreateSchema);
  if (!p.ok) return p.response;
  const { building_id, tenant_id, amount, description, due_date } = p.data;
  if (!building_id || !amount) return NextResponse.json({ error: "חסרים שדות" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const { data, error } = await adminClient.from("payments").insert({
    building_id,
    payer_id: tenant_id ?? null,
    amount: amount,
    description: description ?? "חיוב ידני",
    status: "pending",
    due_date: due_date ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog(session, "CREATE_PAYMENT", "payment", data.id, {
    building_id, amount, description
  }, ip);

  return NextResponse.json({ data });
}
