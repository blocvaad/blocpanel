import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import BuildingsTable from "@/components/ui/BuildingsTable";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buildingEntitlementView, type BuildingBillingFacts } from "@/lib/entitlementView";
export const dynamic = "force-dynamic";

export default async function BuildingsPage() {
  await requirePageSession("buildings.read");
  const { data: buildings, count } = await adminClient
    .from("panel_buildings_view")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);

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
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>{count ?? 0} בניינים פעילים</p>
      </div>

      <BuildingsTable initialData={buildings ?? []} entitlements={entitlements} />

      {/* Archived */}
      {(archived ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            🗄️ ארכיב ({archived?.length})
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
