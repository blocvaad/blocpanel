// src/app/api/management-companies/route.ts
//
// GET   — חברות הניהול, עם מה שצוות bloc צריך כדי להחליט (186: כתובת משרד, היקף תיק, מתי נשלחה; 187: מתי
//         פרטי הבקשה השתנו, מתי הוחלט), הבעלים והבניין שלו, והמסלול. canDecide — האם המשתמש רשאי להחליט.
//         ?history=<id> — מה קרה עם חברה אחת (lib/companies.companyHistory): היומן של bloc ויומן הפאנל.
// PATCH — ההחלטה (bloc REG-2): אישור / דחייה / השעיה / ביטול השעיה. הפאנל לא כותב ל-DB: הבקשה נחתמת ונשלחת
//         ל-bloc (/api/internal/management-companies), שמחליט על המצב שנראה כאן (SQL 187) ושולח לבעלים הודעה
//         באפליקציה, Push ומייל. עד עכשיו הפאנל קרא בעצמו ל-admin_set_management_status (126) ושלח הודעה משלו —
//         בלי לבדוק מה המצב, עם אימוג'י, ובלי מייל.
//
// הרשאה: management.approve (admin, superadmin). כל החלטה נרשמת גם ביומן הפאנל (MANAGEMENT_*).
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, managementActionSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { callBloc } from "@/lib/blocApi";
import { can } from "@/lib/permissions";
import { companyHistory, type BlocAuditRow, type PanelAuditRow } from "@/lib/companies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPANY_COLUMNS = [
  "id, name, invite_code, phone, email, description, tax_id, coverage_areas, status, created_at, owner_id",
  "office_address, portfolio_size, submitted_at, reject_reason, details_updated_at, decided_at",
].join(", ");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function history(id: string) {
  const [bloc, panel] = await Promise.all([
    (adminClient as any).from("audit_logs").select("id, action, created_at, details")
      .eq("target_type", "management_company").eq("target_id", id).order("created_at", { ascending: false }).limit(40),
    (adminClient as any).from("panel_audit_logs").select("id, action, created_at, admin_email, metadata")
      .eq("entity_id", id).like("action", "MANAGEMENT_%").order("created_at", { ascending: false }).limit(40),
  ]);
  if (bloc.error || panel.error) {
    console.error("[management-companies history]", bloc.error ?? panel.error);
    return NextResponse.json({ error: "טעינת ההיסטוריה נכשלה" }, { status: 500 });
  }
  return NextResponse.json({ history: companyHistory((bloc.data ?? []) as BlocAuditRow[], (panel.data ?? []) as PanelAuditRow[]) });
}

export async function GET(req: Request) {
  const g = await guard();
  if (!g.ok) return g.response;

  const historyOf = new URL(req.url).searchParams.get("history");
  if (historyOf !== null) {
    if (!UUID.test(historyOf)) return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
    return history(historyOf);
  }

  const { data: companies, error } = await (adminClient as any)
    .from("management_companies")
    .select(COMPANY_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[management-companies GET]", error);
    return NextResponse.json({ error: "טעינת חברות הניהול נכשלה. אם זה אחרי עדכון, ודאו ש-SQL 187 רץ ב-Supabase." }, { status: 500 });
  }

  const canDecide = can(g.session.role, "management.approve");
  if (!companies?.length) return NextResponse.json({ companies: [], canGrant: g.session.role === "superadmin", canDecide });

  const ownerIds = [...new Set((companies as any[]).map((c: any) => c.owner_id).filter(Boolean))];
  const { data: profiles } = await (adminClient as any)
    .from("profiles")
    .select("id, full_name, email, building_id")
    .in("id", ownerIds);

  // הבניין של הבעלים — שאילתה נפרדת (בין profiles ל-buildings יש יותר מקשר אחד; embed היה דו-משמעי).
  const buildingIds = [...new Set((profiles ?? []).map((p: any) => p.building_id).filter(Boolean))];
  const { data: buildings } = buildingIds.length
    ? await (adminClient as any).from("buildings").select("id, name").in("id", buildingIds)
    : { data: [] };
  const buildingName: Record<string, string> = {};
  (buildings ?? []).forEach((b: any) => { buildingName[b.id] = b.name; });

  const profileMap: Record<string, any> = {};
  (profiles ?? []).forEach((p: any) => { profileMap[p.id] = { ...p, building_name: p.building_id ? buildingName[p.building_id] ?? null : null }; });

  // מסלול, ניסיון, חסד ומספר בניינים (125). בלי המיגרציה — בלי המידע, לא שגיאה.
  const { data: billingRows } = await (adminClient as any).rpc("panel_company_billing");
  const billingMap: Record<string, any> = {};
  (billingRows ?? []).forEach((b: any) => { billingMap[b.company_id] = b; });

  const enriched = (companies as any[]).map((c: any) => ({
    ...c,
    owner: profileMap[c.owner_id] ?? null,
    billing: billingMap[c.id] ?? null,
  }));

  return NextResponse.json({ companies: enriched, canGrant: g.session.role === "superadmin", canDecide });
}

const AUDIT: Record<string, string> = {
  approve: "MANAGEMENT_APPROVE", reject: "MANAGEMENT_REJECT", suspend: "MANAGEMENT_SUSPEND", reactivate: "MANAGEMENT_REACTIVATE",
};

const firstIp = (h: string | null) => (h ? h.split(",")[0]?.trim() || undefined : undefined);

export async function PATCH(req: Request) {
  const g = await guard({ permission: "management.approve" });
  if (!g.ok) return g.response;
  const s = g.session;

  const p = await parseBody(req, managementActionSchema);
  if (!p.ok) return p.response;
  const { id, note, ...rest } = p.data;

  const r = await callBloc("/api/internal/management-companies", {
    ...rest, company_id: id, ...(note ? { panel_note: note } : {}), actor: { id: s.id, email: s.email, role: s.role },
  });
  if (!r.ok) {
    // bloc לא ענה בזמן / שגיאת רשת: ייתכן שההחלטה נשמרה שם (ההודעה, המייל והיומן של bloc רצים לפני התשובה).
    // נרשם ביומן הפאנל שלא ידוע — כדי שיומן הפאנל לא יחסיר החלטה שבוצעה.
    if (r.code === "TIMEOUT" || r.code === "NETWORK") {
      await auditLog(s, "MANAGEMENT_DECISION_UNKNOWN", "management_company", id, {
        action: rest.action, from: rest.expected_status, outcome: "unknown", error: r.code,
        ...("reason" in rest ? { reason: rest.reason } : {}), ...(note ? { note } : {}),
      }, firstIp(req.headers.get("x-forwarded-for")));
    }
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }

  await auditLog(s, AUDIT[rest.action] ?? "MANAGEMENT_DECISION", "management_company", id, {
    action: rest.action,
    company: r.data.company_name ?? null,
    from: r.data.previous_status ?? rest.expected_status,
    to: r.data.status ?? null,
    ...("reason" in rest ? { reason: rest.reason } : {}),
    ...(note ? { note } : {}),
    notified: r.data.notified ?? null,
    email: r.data.email ?? null,
  }, firstIp(req.headers.get("x-forwarded-for")));

  return NextResponse.json({ ok: true, ...r.data });
}
