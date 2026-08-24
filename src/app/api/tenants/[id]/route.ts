import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard({ permission: "tenants.modify" });
  if (!g.ok) return g.response;
  const session = g.session;

  const { id } = await params;
  const body = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  const allowed: Record<string, unknown> = {};
  for (const f of ["approval_status", "role", "floor"]) {
    if (f in body) allowed[f] = body[f];
  }

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

  const action = body.approval_status === "blocked" ? "BLOCK_TENANT"
    : body.approval_status === "approved" ? "APPROVE_TENANT"
    : "UPDATE_TENANT";

  await auditLog(session, action, "tenant", id, { changes: allowed }, ip);
  return NextResponse.json({ data, ok: true });
}
