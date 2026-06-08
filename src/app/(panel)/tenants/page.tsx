import { adminClient } from "@/lib/supabase";
import TenantsTable from "@/components/ui/TenantsTable";
export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const { data: tenants, count } = await adminClient
    .from("panel_tenants_view")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  // Archived tenants (from archived buildings)
  const { data: archivedTenants } = await adminClient
    .from("profiles")
    .select("id, full_name, role, created_at, buildings!inner(name, is_archived)")
    .eq("buildings.is_archived", true)
    .limit(50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>דיירים</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>{count ?? 0} דיירים · פרטי פרטיות לפי הגדרות הדייר 🔒</p>
      </div>
      <TenantsTable initialData={tenants ?? []} />

      {/* Archived tenants */}
      {(archivedTenants ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "12px" }}>
            🗄️ דיירים בארכיב — בניינים שהושהו ({archivedTenants?.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {(archivedTenants ?? []).map((t: any) => (
              <div key={t.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", opacity: .5 }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-3)" }}>{t.full_name.charAt(0)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", color: "var(--text-2)" }}>{t.full_name}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                    {(t.buildings as any)?.name ?? "בניין מארכב"} · {t.role}
                  </div>
                </div>
                <span className="badge badge-muted" style={{ fontSize: "11px" }}>🗄️ ארכיב</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
