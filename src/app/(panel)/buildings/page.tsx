import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import BuildingsTable from "@/components/ui/BuildingsTable";
import Link from "next/link";
import { Plus, Archive } from "lucide-react";
import { buildingEntitlementView, type BuildingBillingFacts } from "@/lib/entitlementView";
import { fetchAll } from "@/lib/fetchAll";
import { can } from "@/lib/permissions";
import type { PanelBuilding } from "@/types";
export const dynamic = "force-dynamic";

const activeText = (n: number) => (n === 1 ? "בניין פעיל אחד" : `${n} בניינים פעילים`);

export default async function BuildingsPage() {
  const session = await requirePageSession("buildings.read");
  // כל הבניינים (לא רק 100 הראשונים), בדפים. ה-view מחזיר is_active=true קבוע (000_baseline) — הסטטוס
  // האמיתי נקרא מ-buildings, אחרת בניין מושעה הופיע כפעיל אחרי רענון.
  const [viewRes, flagsRes] = await Promise.all([
    fetchAll<PanelBuilding>((from, to) => adminClient.from("panel_buildings_view").select("*")
      .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to) as any),
    fetchAll<{ id: string; is_active: boolean | null }>((from, to) => adminClient.from("buildings").select("id, is_active")
      .not("is_archived", "is", true).order("id", { ascending: true }).range(from, to) as any),
  ]);
  const activeOf = new Map(flagsRes.rows.map((b) => [b.id, b.is_active !== false]));
  const buildings = viewRes.rows.map((b) => ({ ...b, is_active: activeOf.get(b.id) ?? b.is_active !== false }));
  const suspendedCount = buildings.filter((b) => !b.is_active).length;

  // מסלול בפועל לכל בניין (כולל כיסוי דרך חברת ניהול / חסד / רדום). 125 חסרה → בלי תג.
  const { data: billing } = await adminClient.rpc("panel_building_billing", { p_building_id: null });
  const now = Date.now();
  const entitlements: Record<string, { label: string; tone: string }> = {};
  for (const f of (billing ?? []) as Array<BuildingBillingFacts & { building_id: string }>) {
    const v = buildingEntitlementView(f, now);
    entitlements[f.building_id] = { label: v.label, tone: v.tone };
  }

  // Get archived buildings
  const { data: archived } = await adminClient
    .from("buildings")
    .select("id,name,archived_at,archived_reason")
    .eq("is_archived", true)
    .order("archived_at", { ascending: false });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>בניינים</h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "3px" }}>
          {activeText(buildings.length - suspendedCount)}{suspendedCount ? `, ${suspendedCount === 1 ? "בניין מושעה אחד" : `${suspendedCount} מושעים`}` : ""}
        </p>
      </div>

      {(viewRes.error || flagsRes.error || viewRes.truncated) && (
        <div role="alert" className="card" style={{ padding: "12px 16px", fontSize: "14px", color: "var(--yellow)" }}>
          {viewRes.error || flagsRes.error ? "חלק מרשימת הבניינים לא נטען. רעננו את הדף." : "הרשימה חלקית: יש יותר בניינים ממה שנטען."}
        </div>
      )}

      <BuildingsTable initialData={buildings} entitlements={entitlements}
        canModify={can(session.role, "buildings.modify")} canArchive={session.role === "superadmin"} />

      {/* Archived */}
      {(archived ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Archive size={14} /> ארכיון ({archived?.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {(archived ?? []).map(b => (
              <div key={b.id} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px", opacity: .6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-2)" }}>{b.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{b.archived_reason ?? "—"}</div>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
                  {b.archived_at ? new Date(b.archived_at).toLocaleDateString("he-IL") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
