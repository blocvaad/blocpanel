// src/app/api/management-companies/route.ts
import { NextResponse } from "next/server";
import { getSession }   from "@/lib/auth";
import { adminClient }  from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await adminClient
    .from("management_companies")
    .select(`
      id, name, invite_code, phone, email, description,
      tax_id, coverage_areas, status, created_at,
      owner:owner_id (
        id, full_name, email, building_id,
        buildings:building_id ( name, address )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ companies: data ?? [] });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action, reason } = await req.json();
  if (!id || !action) return NextResponse.json({ error: "חסרים פרמטרים" }, { status: 400 });

  const validActions = ["approve", "reject", "suspend", "reactivate"];
  if (!validActions.includes(action))
    return NextResponse.json({ error: "פעולה לא תקינה" }, { status: 400 });

  const { data: company } = await adminClient
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
    action === "reject"     ? "admin"       :
    action === "suspend"    ? "admin"       :
    action === "reactivate" ? "management"  : null;

  if (!newStatus || !newRole)
    return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });

  await adminClient
    .from("management_companies")
    .update({ status: newStatus, ...(reason ? { reject_reason: reason } : {}) })
    .eq("id", id);

  await adminClient
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

  await adminClient.from("notifications").insert({
    user_id:  company.owner_id,
    type:     "announcement",
    title,
    content,
    link:     "/management",
  });

  return NextResponse.json({ success: true, newStatus, newRole });
}
