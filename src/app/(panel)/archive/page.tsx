import { adminClient } from "@/lib/supabase";
import { Archive, Users, Calendar, FileText } from "lucide-react";
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { data: buildings } = await adminClient
    .from("buildings")
    .select("id,name,address,invite_code,archived_at,archived_reason,plan")
    .eq("is_archived", true)
    .order("archived_at", { ascending: false });

  const archivedIds = (buildings ?? []).map(b => b.id);

  type Tenant = { id: string; full_name: string; role: string; apartment: string | null; approval_status: string; created_at: string; building_id: string; };
  const { data: tenants } = archivedIds.length > 0
    ? await adminClient.from("profiles").select("id,full_name,role,apartment,approval_status,created_at,building_id").in("building_id", archivedIds)
    : { data: [] as Tenant[] };

  const byBuilding: Record<string, Tenant[]> = {};
  for (const t of (tenants ?? []) as Tenant[]) {
    if (!byBuilding[t.building_id]) byBuilding[t.building_id] = [];
    byBuilding[t.building_id].push(t);
  }

  const ROLE: Record<string, string> = { admin: "מנהל", council: "ועד", tenant: "דייר" };
  const total = (tenants ?? []).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>ארכיב</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>בניינים ודיירים שמורים לפי GDPR</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>בניינים בארכיב</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--yellow)", letterSpacing: "-.03em" }}>{(buildings ?? []).length}</div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>דיירים שמורים</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>{total}</div>
        </div>
      </div>

      {/* Legal notice */}
      <div style={{ background: "#3b82f610", border: "1px solid #3b82f630", borderRadius: "12px", padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <FileText size={18} style={{ color: "var(--blue)", flexShrink: 0, marginTop: "1px" }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>שמירת מסמכים לפי חוק</div>
            <div style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
              כל הנתונים נשמרים למינימום 7 שנים לפי חוק הרשויות המקומיות וה-GDPR.
              מחיקה מלאה דורשת אישור משפטי ופעולה ידנית ב-Supabase בלבד.
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {(buildings ?? []).length === 0 ? (
        <div className="card" style={{ padding: "56px 24px", textAlign: "center" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "16px", background: "#eab30818", border: "1px solid #eab30830", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Archive size={28} color="#eab308" />
          </div>
          <div style={{ fontSize: "17px", fontWeight: "700", color: "var(--text-2)", marginBottom: "6px" }}>הארכיב ריק</div>
          <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.6 }}>
            בניינים שיועברו לארכיב יופיעו כאן<br/>עם כל הנתונים והדיירים שלהם
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {(buildings ?? []).map(b => {
            const bTenants = byBuilding[b.id] ?? [];
            return (
              <div key={b.id} className="card" style={{ padding: "20px", borderColor: "#eab30830" }}>

                {/* Building header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: "#eab30818", border: "1px solid #eab30830", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Archive size={20} color="#eab308" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-2)", marginBottom: "3px" }}>{b.name}</div>
                    {b.address && <div style={{ fontSize: "13px", color: "var(--text-3)" }}>{b.address}</div>}
                  </div>
                  <span className="badge badge-yellow" style={{ flexShrink: 0 }}>🗄️ ארכיב</span>
                </div>

                {/* Info grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                  <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "4px" }}>סיבה</div>
                    <div style={{ fontSize: "12px", color: "var(--text-2)" }}>{b.archived_reason ?? "—"}</div>
                  </div>
                  <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "4px" }}>תאריך</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <Calendar size={12} style={{ color: "var(--text-3)" }} />
                      <span style={{ fontSize: "12px", color: "var(--text-2)", fontFamily: "var(--mono)" }}>
                        {b.archived_at ? new Date(b.archived_at).toLocaleDateString("he-IL") : "—"}
                      </span>
                    </div>
                  </div>
                  <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "4px" }}>דיירים</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <Users size={13} style={{ color: "var(--text-3)" }} />
                      <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-2)" }}>{bTenants.length}</span>
                    </div>
                  </div>
                </div>

                {/* Tenants */}
                {bTenants.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                    <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "10px" }}>
                      דיירים שמורים
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {bTenants.map(t => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "8px", background: "var(--surface)" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-3)" }}>{t.full_name.charAt(0)}</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "14px", color: "var(--text-2)", fontWeight: "500" }}>{t.full_name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>
                              {ROLE[t.role] ?? t.role}
                              {t.apartment ? ` · דירה ${t.apartment}` : ""}
                            </div>
                          </div>
                          <span className="badge badge-muted" style={{ fontSize: "11px" }}>
                            {new Date(t.created_at).toLocaleDateString("he-IL")}
                          </span>
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
