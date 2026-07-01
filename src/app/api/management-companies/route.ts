// src/app/api/management-companies/route.ts
import { NextResponse } from "next/server";
import { getSession }   from "@/lib/auth";
import { adminClient }  from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: companies, error } = await (adminClient as any)
    .from("management_companies")
    .select("id, name, invite_code, phone, email, description, tax_id, coverage_areas, status, created_at, owner_id")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[management-companies GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!companies?.length) return NextResponse.json({ companies: [] });

  const ownerIds = [...new Set((companies as any[]).map((c: any) => c.owner_id).filter(Boolean))];
  const { data: profiles } = await (adminClient as any)
    .from("profiles")
    .select("id, full_name, email, building_id")
    .in("id", ownerIds);

  const profileMap: Record<string, any> = {};
  (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

  const enriched = (companies as any[]).map((c: any) => ({
    ...c,
    owner: profileMap[c.owner_id] ?? null,
  }));

  return NextResponse.json({ companies: enriched });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action, reason } = await req.json();
  if (!id || !action) return NextResponse.json({ error: "חסרים פרמטרים" }, { status: 400 });

  const validActions = ["approve", "reject", "suspend", "reactivate"];
  if (!validActions.includes(action))
    return NextResponse.json({ error: "פעולה לא תקינה" }, { status: 400 });

  const { data: company } = await (adminClient as any)
    .from("management_companies")
    .select("id, name, owner_id")
    .eq("id", id)
    .single();

  if (!company) return NextResponse.json({ error: "חברה לא נמצאה" }, { status: 404 });

  const newStatus =
    action === "approve"    ? "active"    :
    action === "reject"     ? "rejected"  :
    action === "suspend"    ? "suspended" :
    action === "reactivate" ? "active"    : null;

  const newRole =
    action === "approve"    ? "management" :
    action === "reject"     ? "tenant"     :
    action === "suspend"    ? "tenant"     :
    action === "reactivate" ? "management" : null;

  if (!newStatus || !newRole)
    return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });

  await (adminClient as any)
    .from("management_companies")
    .update({ status: newStatus, ...(reason ? { reject_reason: reason } : {}) })
    .eq("id", id);

  await (adminClient as any)
    .from("profiles")
    .update({ role: newRole })
    .eq("id", company.owner_id);

  const title =
    action === "approve"    ? `✅ חברת הניהול ${company.name} אושרה!` :
    action === "reject"     ? `❌ בקשת חברת הניהול ${company.name} נדחתה` :
    action === "suspend"    ? `⚠️ חברת הניהול ${company.name} הושעתה` :
                              `✅ חברת הניהול ${company.name} הופעלה מחדש`;

  const content =
    action === "approve"    ? "מעכשיו יש לך גישה מלאה לדשבורד ניהול הבניינים" :
    action === "reject"     ? (reason || "הבקשה נדחתה. ניתן לפנות לתמיכה לפרטים") :
    action === "suspend"    ? "הגישה לדשבורד הושעתה זמנית. פנה לתמיכה לפרטים" :
                              "הגישה לדשבורד הופעלה מחדש";

  await (adminClient as any).from("notifications").insert({
    user_id:  company.owner_id,
    type:     "announcement",
    title,
    content,
    link:     "/management",
  });

  return NextResponse.json({ success: true, newStatus, newRole });
}
