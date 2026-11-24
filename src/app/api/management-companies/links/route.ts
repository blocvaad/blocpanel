// src/app/api/management-companies/links/route.ts
//
// bloc COMPANY-1 (D5 — הבעלים 24/11; bloc החלטה 650) — בקשות של חברות ניהול לנהל בניין שאין בו ועד פעיל.
// GET  — הממתינות, ומה שהוחלט ב-30 הימים האחרונים: החברה, הבניין (קיים / חדש), מי חתם/ה על ההצהרה ובאיזה תפקיד, ומי ביקש/ה.
//        viewer (בלי management.approve) — בלי שם החותם/ת ובלי מי ביקש/ה. canDecide — האם המשתמש רשאי להחליט.
//        קריאה שנכשלה — 503 עם הודעה (לעולם לא "אין בקשות").
// POST — ההחלטה (management.approve): הפאנל לא כותב ל-DB; הבקשה נחתמת ונשלחת ל-bloc (/api/internal/management-links), שמאשר /
//        דוחה ושולח הודעות. כל החלטה נרשמת גם ביומן הפאנל (MANAGEMENT_LINK_*).
import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { parseBody, linkDecisionSchema } from "@/lib/validation";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { callBloc } from "@/lib/blocApi";
import { can } from "@/lib/permissions";
import { sortLinks, type LinkRequest } from "@/lib/companyLinks";

export const dynamic = "force-dynamic";

const COLS = "id, company_id, building_id, new_building, requested_by, signer_name, signer_role, declaration_version, status, decided_at, decline_reason, created_at";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const firstIp = (h: string | null) => (h ? h.split(",")[0]?.trim() || undefined : undefined);

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const canDecide = can(g.session.role, "management.approve");

  // הממתינות — כולן (שתי שאילתות, כדי שהחלטות ישנות לא ידחקו בקשה ממתינה מחוץ לרשימה); מה שהוחלט — 30 הימים האחרונים.
  const since = new Date(Date.now() - MONTH_MS).toISOString();
  const [open, done] = await Promise.all([
    (adminClient as any).from("management_link_requests").select(COLS).eq("status", "pending").order("created_at", { ascending: true }).limit(500),
    (adminClient as any).from("management_link_requests").select(COLS).neq("status", "pending").gte("decided_at", since)
      .order("decided_at", { ascending: false }).limit(200),
  ]);
  const error = open.error ?? done.error;
  if (error) {
    console.error("[management-companies/links GET]", error.code ?? "", error.message ?? "");
    return NextResponse.json({ error: "הבקשות לא נטענו מ-bloc. אם זה אחרי עדכון, ודאו ש-SQL 252 רץ ב-Supabase.", links: [] }, { status: 503 });
  }
  const live = [...((open.data ?? []) as any[]), ...((done.data ?? []) as any[])];
  const companyIds = [...new Set(live.map((r) => r.company_id).filter(Boolean))];
  const buildingIds = [...new Set(live.map((r) => r.building_id).filter(Boolean))];
  const peopleIds = canDecide ? [...new Set(live.map((r) => r.requested_by).filter(Boolean))] : [];
  const [co, bl, pp] = await Promise.all([
    companyIds.length ? (adminClient as any).from("management_companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null }),
    buildingIds.length ? (adminClient as any).from("buildings").select("id, name, address, invite_code").in("id", buildingIds) : Promise.resolve({ data: [], error: null }),
    peopleIds.length ? (adminClient as any).from("profiles").select("id, full_name").in("id", peopleIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (co.error || bl.error || pp.error) {
    console.error("[management-companies/links GET] names", co.error ?? bl.error ?? pp.error);
    return NextResponse.json({ error: "הבקשות לא נטענו מ-bloc. נסו שוב.", links: [] }, { status: 503 });
  }
  const companies = new Map(((co.data ?? []) as any[]).map((c) => [c.id, { id: c.id, name: c.name }]));
  const buildings = new Map(((bl.data ?? []) as any[]).map((b) => [b.id, { id: b.id, name: b.name, address: b.address ?? null, invite_code: canDecide ? b.invite_code ?? null : null }]));
  const people = new Map(((pp.data ?? []) as any[]).map((p) => [p.id, p.full_name ?? null]));

  const links: LinkRequest[] = live.map((r) => ({
    id: r.id, status: r.status, created_at: r.created_at, decided_at: r.decided_at ?? null,
    company: companies.get(r.company_id) ?? null,
    building: r.building_id ? buildings.get(r.building_id) ?? { id: r.building_id, name: "בניין", address: null, invite_code: null } : null,
    new_building: r.new_building ?? null,
    signer_name: canDecide ? r.signer_name : null,
    signer_role: r.signer_role,
    declaration_version: r.declaration_version,
    requester: canDecide && r.requested_by ? people.get(r.requested_by) ?? null : null,
    decline_reason: r.decline_reason ?? null,
  }));
  return NextResponse.json({ links: sortLinks(links), canDecide });
}

export async function POST(req: Request) {
  const g = await guard({ permission: "management.approve" });
  if (!g.ok) return g.response;
  const s = g.session;
  const p = await parseBody(req, linkDecisionSchema);
  if (!p.ok) return p.response;
  const { id, note, action } = p.data;
  const reason = p.data.action === "decline" ? p.data.reason : undefined;

  const r = await callBloc("/api/internal/management-links", {
    action, request_id: id, ...(reason ? { reason } : {}), ...(note ? { panel_note: note } : {}),
    actor: { id: s.id, email: s.email, role: s.role },
  });
  if (!r.ok) {
    // bloc לא ענה בזמן / שגיאת רשת — ייתכן שההחלטה נשמרה שם; נרשם ביומן הפאנל שלא ידוע.
    if (r.code === "TIMEOUT" || r.code === "NETWORK") {
      await auditLog(s, "MANAGEMENT_LINK_UNKNOWN", "management_link", id, { action, outcome: "unknown", error: r.code, ...(reason ? { reason } : {}), ...(note ? { note } : {}) },
        firstIp(req.headers.get("x-forwarded-for")));
    }
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
  await auditLog(s, action === "approve" ? "MANAGEMENT_LINK_APPROVE" : "MANAGEMENT_LINK_DECLINE", "management_link", id, {
    action, building_id: r.data.building_id ?? null, created: r.data.created ?? false,
    ...(reason ? { reason } : {}), ...(note ? { note } : {}),
  }, firstIp(req.headers.get("x-forwarded-for")));
  return NextResponse.json({ ok: true, ...r.data });
}
