import { NextRequest, NextResponse } from "next/server";
import { getSession, auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await adminClient.from("buildings").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { name, address, max_tenants, plan, admin_email, admin_name } = await req.json();
  if (!name) return NextResponse.json({ error: "שם חובה" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for") ?? undefined;

  // Generate unique invite code
  const invite_code = "B-" + Math.random().toString(36).slice(2, 6).toUpperCase();

  // Create building
  const { data: building, error } = await adminClient
    .from("buildings")
    .insert({ name, address, max_tenants: parseInt(max_tenants) || 50, plan: plan || "free", invite_code, is_active: true })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If admin email provided - create profile as admin
  if (admin_email && admin_name) {
    // Check if user exists by searching profiles
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", admin_email)
      .maybeSingle();

    // Try to find by auth - list users and match email
    const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: { users: [] } }));
    const existingUser = users?.find((u: any) => u.email === admin_email);

    if (existingUser) {
      await adminClient.from("profiles").upsert({
        id: existingUser.id,
        full_name: admin_name,
        building_id: building.id,
        role: "admin",
        approval_status: "approved",
      });
    }
  }

  await auditLog(session, "CREATE_BUILDING", "building", building.id, { name, plan, admin_email }, ip);
  return NextResponse.json({ data: building });
}
