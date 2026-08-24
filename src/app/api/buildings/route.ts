import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, buildingCreateSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  const { data } = await adminClient.from("buildings").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ data });
}

async function generateInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = "B-" + Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 6)
      .toUpperCase();
    const { data } = await adminClient.from("buildings").select("id").eq("invite_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Failed to generate unique invite code");
}

export async function POST(req: NextRequest) {
  const g = await guard({ permission: "buildings.modify" });
  if (!g.ok) return g.response;
  const session = g.session;

  const p = await parseBody(req, buildingCreateSchema);
  if (!p.ok) return p.response;
  const { name, address, max_tenants, plan, admin_email, admin_name } = p.data;
  if (!name) return NextResponse.json({ error: "שם חובה" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const invite_code = await generateInviteCode();

  const { data: building, error } = await adminClient
    .from("buildings")
    .insert({ name, address, max_tenants: max_tenants ?? 50, plan: plan || "free", invite_code, is_active: true })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (admin_email && admin_name) {
    const { data: { users } } = await adminClient.auth.admin
      .listUsers({ perPage: 1000 })
      .catch(() => ({ data: { users: [] } }));
    const user = (users ?? []).find((u: any) => u.email === admin_email);
    if (user) {
      await adminClient.from("profiles").upsert({
        id: user.id, full_name: admin_name,
        building_id: building.id, role: "admin", approval_status: "approved",
      });
    }
  }

  await auditLog(session, "CREATE_BUILDING", "building", building.id, { name, plan, admin_email }, ip);

  if (process.env.EXTERNAL_WEBHOOK_URL) {
    fetch(`${process.env.NEXT_PUBLIC_PANEL_URL ?? ""}/api/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": process.env.WEBHOOK_SECRET ?? "" },
      body: JSON.stringify({ event: "building.created", data: { name, plan, id: building.id } }),
    }).catch(() => {});
  }

  return NextResponse.json({ data: building });
}
