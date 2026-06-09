import { NextRequest, NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { building_id, tenant_id, amount, description, due_date } = await req.json();
  if (!building_id || !amount) return NextResponse.json({ error: "חסרים שדות" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const { data, error } = await adminClient.from("payments").insert({
    building_id,
    payer_id: tenant_id ?? null,
    amount: parseFloat(amount),
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
