import { NextRequest, NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

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
