import { adminClient } from "@/lib/supabase";
import { Archive, Building2, Users } from "lucide-react";
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { data: buildings } = await adminClient
    .from("buildings")
    .select("id, name, address, invite_code, archived_at, archived_reason, plan")
    .eq("is_archived", true)
    .order("archived_at", { ascending: false });

  // Get tenants from archived buildings
  const archivedBuildingIds = (buildings ?? []).map(b => b.id);
  
  const { data: tenants } = archivedBuildingIds.length > 0
    ? await adminClient
        .from("profiles")
        .select("id, full_name, role, apartment, approval_status, created_at, building_id")
        .in("building_id", archivedBuildingIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  type Tenant = { id: any; full_name: any; role: any; apartment: any; approval_status: any; created_at: any; building_id: any; };
  const tenantsByBuilding: Record<string, Tenant[]> = {};
  for (const t of (tenants ?? []) as Tenant[]) {
    if (!tenantsByBuilding[t.building_id]) tenantsByBuilding[t.building_id] = [];
    tenantsByBuilding[t.building_id]!.push(t);
  }

  const ROLE: Record<string, string> = { admin: "מנהל", council: "ועד", tenant: "דייר" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>ארכיב</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
            בניינים ודיירים שמורים לפי GDPR — נתונים לא נמחקים
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div className="card" style={{ padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}>{(buildings ?? []).length}</div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>בניינים</div>
          </div>
          <div className="card" style={{ padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}>{(tenants ?? []).length}</div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>דיירים</div>
          </div>
        </div>
      </div>

      {/* Legal notice */}
      <div style={{ background: "#3b82f610", border: "1px solid #3b82f630", borderRadius: "10px", padding: "14px 16px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
        📋 <strong>שמירת מסמכים לפי חוק:</strong> כל הנתונים נשמרים למינימום 7 שנים.
        מחיקה מלאה דורשת אישור משפטי ופעולה ידנית ב-Supabase בלבד.
      </div>

      {(buildings ?? []).length === 0 ? (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <Archive size={40} style={{ color: "var(--text-3)", margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-2)", marginBottom: "6px" }}>הארכיב ריק</div>
          <div style={{ fontSize: "13px", color: "var(--text-3)" }}>בניינים שיועברו לארכיב יופיעו כאן</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {(buildings ?? []).map(b => {
            const bTenants = tenantsByBuilding[b.id] ?? [];
            return (
              <div key={b.id} className="card" style={{ padding: "20px", opacity: .85 }}>
                {/* Building header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#eab30818", border: "1px solid #eab30830", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Archive size={18} color="#eab308" />
                    </div>
                    <div>
                      <div style={{ fontSize: "17px", fontWeight: "700", color: "var(--text-2)" }}>{b.name}</div>
                      {b.address && <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{b.address}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <span className="badge badge-yellow" style={{ fontSize: "11px" }}>🗄️ ארכיב</span>
                    {b.archived_at && (
                      <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", fontFamily: "var(--mono)" }}>
                        {new Date(b.archived_at).toLocaleDateString("he-IL")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                  <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>סיבה</div>
                    <div style={{ fontSize: "12px", color: "var(--text-2)" }}>{b.archived_reason ?? "—"}</div>
                  </div>
                  <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>דיירים</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <Users size={13} style={{ color: "var(--text-3)" }} />
                      <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-2)" }}>{bTenants.length}</span>
                    </div>
                  </div>
                  <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>קוד הזמנה</div>
                    <code style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{b.invite_code ?? "—"}</code>
                  </div>
                </div>

                {/* Tenants list */}
                {bTenants.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "8px", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".06em" }}>דיירים שמורים</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {bTenants.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "6px", background: "var(--surface)" }}>
                          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-3)" }}>{t.full_name.charAt(0)}</span>
                          </div>
                          <span style={{ flex: 1, fontSize: "13px", color: "var(--text-3)" }}>{t.full_name}</span>
                          <span className="badge badge-muted" style={{ fontSize: "11px" }}>{ROLE[t.role] ?? t.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
