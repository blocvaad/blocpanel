"use client";
import { useState } from "react";
import { Search, Lock, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PanelTenant } from "@/types";

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  approved: { label: "מאושר",  bg: "#22c55e18", color: "#22c55e" },
  pending:  { label: "ממתין",  bg: "#eab30818", color: "#eab308" },
  blocked:  { label: "חסום",   bg: "#ef444418", color: "#ef4444" },
  rejected: { label: "נדחה",   bg: "#52525b18", color: "#52525b" },
};
const ROLE: Record<string, string> = { admin: "מנהל 👑", council: "ועד", tenant: "דייר" };
const FILTERS = ["הכל", "מאושר", "ממתין", "חסום", "נדחה"];
const FM: Record<string, string> = { "הכל":"", "מאושר":"approved", "ממתין":"pending", "חסום":"blocked", "נדחה":"rejected" };

export default function TenantsTable({ initialData }: { initialData: PanelTenant[] }) {
  const [tenants, setTenants] = useState(initialData);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("הכל");
  const [loading, setLoading] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { text: string; ok: boolean }>>({});
  const router = useRouter();

  const filtered = tenants.filter(t => {
    const ms = (t.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.building_name ?? "").toLowerCase().includes(search.toLowerCase());
    return ms && (filter === "הכל" || t.approval_status === FM[filter]);
  });

  async function updateStatus(t: PanelTenant, status: string) {
    setLoading(t.id);
    try {
      const res = await fetch(`/api/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ approval_status: status }),
      });
      if (res.ok) {
        setTenants(prev => prev.map(x =>
          x.id === t.id ? { ...x, approval_status: status as PanelTenant["approval_status"] } : x
        ));
        setMsgs(p => ({ ...p, [t.id]: { text: "✓ עודכן", ok: true } }));
      } else {
        const j = await res.json();
        setMsgs(p => ({ ...p, [t.id]: { text: j.error ?? "שגיאה", ok: false } }));
      }
    } catch {
      setMsgs(p => ({ ...p, [t.id]: { text: "שגיאת רשת", ok: false } }));
    }
    setLoading(null);
    setTimeout(() => setMsgs(p => { const n = { ...p }; delete n[t.id]; return n; }), 3000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input className="input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם או בניין..."
          style={{ paddingRight: "44px", fontSize: "15px", height: "48px" }} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {FILTERS.map(f => {
          const count = f === "הכל" ? tenants.length : tenants.filter(t => t.approval_status === FM[f]).length;
          const active = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "8px 18px", borderRadius: "99px", border: "1px solid",
              borderColor: active ? "var(--text)" : "var(--border)",
              background: active ? "var(--text)" : "transparent",
              color: active ? "var(--bg)" : "var(--text-3)",
              fontSize: "14px", fontWeight: "500", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}>
              {f}
              <span style={{
                fontSize: "12px", fontWeight: "600",
                color: active ? "var(--bg)" : "var(--text-3)",
                background: active ? "rgba(0,0,0,0.15)" : "var(--border)",
                padding: "0 6px", borderRadius: "99px",
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {filtered.map(t => {
          const sc = STATUS[t.approval_status] ?? STATUS.pending;
          const isLoading = loading === t.id;
          const msg = msgs[t.id];
          return (
            <div key={t.id} className="card" style={{ padding: "16px 18px" }}>
              {/* Top row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0,
                    background: "#3b82f620", border: "1px solid #3b82f640",
                    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                  }}>
                    {t.avatar_url
                      ? <img src={t.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--blue)" }}>{t.full_name.charAt(0)}</span>
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)" }}>{t.full_name}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "1px" }}>{t.building_name}</div>
                  </div>
                </div>
                <span className="badge" style={{ background: sc.bg, color: sc.color, fontSize: "12px", padding: "4px 10px" }}>
                  {sc.label}
                </span>
              </div>

              {/* Info row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".05em" }}>דירה</div>
                  <div style={{ fontSize: "13px", fontWeight: "500", color: t.apartment_display.startsWith("🔒") ? "var(--text-3)" : "var(--text)" }}>
                    {t.apartment_display.startsWith("🔒") ? <Lock size={12} /> : t.apartment_display}
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".05em" }}>תפקיד</div>
                  <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--text)" }}>{ROLE[t.role] ?? t.role}</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".05em" }}>הצטרף</div>
                  <div style={{ fontSize: "12px", color: "var(--text-2)", fontFamily: "var(--mono)" }}>{new Date(t.created_at).toLocaleDateString("he-IL")}</div>
                </div>
              </div>

              {/* Phone */}
              {!t.phone_masked.startsWith("🔒") && (
                <div style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "var(--mono)", marginBottom: "12px" }}>
                  📱 {t.phone_masked}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {t.approval_status === "pending" && (
                  <button onClick={() => updateStatus(t, "approved")} disabled={isLoading} style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                    background: "#22c55e20", color: "var(--green)",
                    fontSize: "14px", fontWeight: "600", cursor: "pointer",
                    opacity: isLoading ? .5 : 1,
                  }}>✓ אשר</button>
                )}
                {t.approval_status !== "blocked" ? (
                  <button onClick={() => updateStatus(t, "blocked")} disabled={isLoading} style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                    background: "#ef444420", color: "var(--red)",
                    fontSize: "14px", fontWeight: "600", cursor: "pointer",
                    opacity: isLoading ? .5 : 1,
                  }}>✗ חסום</button>
                ) : (
                  <button onClick={() => updateStatus(t, "approved")} disabled={isLoading} style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                    background: "#22c55e20", color: "var(--green)",
                    fontSize: "14px", fontWeight: "600", cursor: "pointer",
                    opacity: isLoading ? .5 : 1,
                  }}>↑ שחרר</button>
                )}
                {msg && (
                  <span style={{ fontSize: "13px", color: msg.ok ? "var(--green)" : "var(--red)", fontWeight: "500" }}>
                    {msg.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>
            לא נמצאו דיירים
          </div>
        )}
      </div>
    </div>
  );
}
