import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { parseBody, tenantUpdateSchema } from "@/lib/validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ permission: "tenants.modify" });
  if (!g.ok) return g.response;
  const session = g.session;

  const { id } = await params;
  const parsed = await parseBody(req, tenantUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const allowed = parsed.data;
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  if (Object.keys(allowed).length === 0)
    return NextResponse.json({ error: "אין שדות לעדכון" }, { status: 400 });

  const { data, error } = await adminClient
    .from("profiles")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[tenants PATCH]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const action = allowed.approval_status === "blocked" ? "BLOCK_TENANT"
    : allowed.approval_status === "approved" ? "APPROVE_TENANT"
    : "UPDATE_TENANT";

  await auditLog(session, action, "tenant", id, { changes: allowed }, ip);
  return NextResponse.json({ data, ok: true });
}
