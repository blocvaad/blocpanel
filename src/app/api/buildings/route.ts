import { NextRequest, NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const { data } = await adminClient
      .from("buildings")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();

    if (!data) return code;
  }
  throw new Error("Failed to generate unique invite code");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { name, address, max_tenants, plan, admin_email, admin_name } = await req.json();
  if (!name) return NextResponse.json({ error: "שם חובה" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const invite_code = await generateInviteCode();

  const { data: building, error } = await adminClient
    .from("buildings")
    .insert({ name, address, max_tenants: parseInt(max_tenants) || 50, plan: plan || "free", invite_code, is_active: true })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (admin_email && admin_name) {
    const { data: { user } } = await adminClient.auth.admin
      .getUserByEmail(admin_email)
      .catch(() => ({ data: { user: null } }));
    if (user) {
      await adminClient.from("profiles").upsert({
        id: user.id,
        full_name: admin_name,
        building_id: building.id,
        role: "admin",
        approval_status: "approved",
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
