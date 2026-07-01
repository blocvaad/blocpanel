'use client'

import { useEffect, useState } from "react";
import { Building2, Check, X, AlertTriangle, Clock, RefreshCw, ChevronDown, ChevronUp, Phone, Mail, MapPin, Hash } from "lucide-react";

type Company = {
  id: string;
  name: string;
  invite_code: string;
  phone: string | null;
  email: string | null;
  description: string | null;
  tax_id: string | null;
  coverage_areas: string[] | null;
  status: "pending_approval" | "active" | "rejected" | "suspended";
  created_at: string;
  owner: {
    id: string;
    full_name: string;
    email: string | null;
    buildings: { name: string; address: string | null } | null;
  } | null;
};

const STATUS_CFG = {
  pending_approval: { label: "ממתין לאישור", color: "#f59e0b", bg: "#fef3c7", icon: Clock },
  active:           { label: "פעיל",          color: "#10b981", bg: "#d1fae5", icon: Check },
  rejected:         { label: "נדחה",           color: "#ef4444", bg: "#fee2e2", icon: X },
  suspended:        { label: "מושעה",          color: "#6b7280", bg: "#f3f4f6", icon: AlertTriangle },
};

function CompanyCard({ c, onAction }: { c: Company; onAction: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading,  setLoading]  = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const cfg = STATUS_CFG[c.status] ?? STATUS_CFG.pending_approval;
  const Icon = cfg.icon;

  const doAction = async (action: string, reason?: string) => {
    setLoading(action);
    await fetch("/api/management-companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, action, reason }),
    });
    setLoading(null);
    setShowReject(false);
    onAction();
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Building2 size={20} color="#3b82f6" strokeWidth={1.7} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--text)" }}>{c.name}</span>
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 10px", borderRadius: "99px", background: cfg.bg, color: cfg.color, display: "flex", alignItems: "center", gap: "4px" }}>
              <Icon size={11} strokeWidth={2.5} /> {cfg.label}
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>
            {c.owner?.full_name} · {c.owner?.buildings?.name ?? "לא מחובר לבניין"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <span style={{ fontSize: "11px", fontFamily: "var(--mono)", color: "var(--text-3)" }}>
            {new Date(c.created_at).toLocaleDateString("he-IL")}
          </span>
          <button onClick={() => setExpanded(e => !e)} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "7px", padding: "6px 8px", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center" }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {c.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Phone size={13} color="var(--text-3)" strokeWidth={1.7} />
                <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "var(--mono)" }}>{c.phone}</span>
              </div>
            )}
            {c.email && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Mail size={13} color="var(--text-3)" strokeWidth={1.7} />
                <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "var(--mono)" }}>{c.email}</span>
              </div>
            )}
            {c.tax_id && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Hash size={13} color="var(--text-3)" strokeWidth={1.7} />
                <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "var(--mono)" }}>ח.פ. {c.tax_id}</span>
              </div>
            )}
            {c.invite_code && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--mono)", background: "var(--card)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: "5px", color: "var(--blue)" }}>{c.invite_code}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {c.description && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "6px" }}>תיאור</div>
              <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>{c.description}</p>
            </div>
          )}

          {/* Coverage areas */}
          {(c.coverage_areas ?? []).length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <MapPin size={13} color="var(--text-3)" strokeWidth={1.7} />
                <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>אזורי פעילות</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {c.coverage_areas!.map(a => (
                  <span key={a} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "99px", background: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe" }}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "4px", borderTop: "1px solid var(--border)" }}>
            {c.status === "pending_approval" && (
              <>
                <button
                  onClick={() => doAction("approve")}
                  disabled={!!loading}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: "8px", border: "none", background: "#10b981", color: "white", fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: loading ? 0.6 : 1 }}>
                  {loading === "approve" ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
                  אשר חברה
                </button>
                <button
                  onClick={() => setShowReject(r => !r)}
                  style={{ flex: 1, padding: "10px 16px", borderRadius: "8px", border: "1px solid #fca5a5", background: "#fee2e2", color: "#ef4444", fontWeight: "700", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <X size={14} /> דחה
                </button>
              </>
            )}
            {c.status === "active" && (
              <button
                onClick={() => doAction("suspend")}
                disabled={!!loading}
                style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-3)", fontWeight: "600", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                {loading === "suspend" ? <RefreshCw size={14} className="spin" /> : <AlertTriangle size={14} />}
                השעה
              </button>
            )}
            {(c.status === "suspended" || c.status === "rejected") && (
              <button
                onClick={() => doAction("reactivate")}
                disabled={!!loading}
                style={{ padding: "10px 16px", borderRadius: "8px", border: "none", background: "#3b82f6", color: "white", fontWeight: "600", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                {loading === "reactivate" ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
                הפעל מחדש
              </button>
            )}
          </div>

          {/* Reject reason input */}
          {showReject && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="סיבת הדחייה (אופציונלי — תישלח לחברה)"
                rows={3}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13px", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
              <button
                onClick={() => doAction("reject", rejectReason || undefined)}
                disabled={!!loading}
                style={{ padding: "10px 16px", borderRadius: "8px", border: "none", background: "#ef4444", color: "white", fontWeight: "700", fontSize: "13px", cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
                {loading === "reject" ? "שולח..." : "אשר דחייה"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManagementCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<"all" | "pending_approval" | "active" | "rejected" | "suspended">("pending_approval");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/management-companies");
    const d = await r.json();
    setCompanies(d.companies ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? companies : companies.filter(c => c.status === filter);
  const pendingCount = companies.filter(c => c.status === "pending_approval").length;

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "pending_approval", label: `ממתינות (${pendingCount})` },
    { key: "active",           label: "פעילות" },
    { key: "suspended",        label: "מושעות" },
    { key: "rejected",         label: "נדחו" },
    { key: "all",              label: "הכל" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>חברות ניהול</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
            {companies.length} חברות · {pendingCount > 0 && <span style={{ color: "#f59e0b", fontWeight: "600" }}>{pendingCount} ממתינות לאישור</span>}
          </p>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-2)", fontSize: "13px", cursor: "pointer" }}>
          <RefreshCw size={14} strokeWidth={1.7} /> רענן
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {Object.entries(STATUS_CFG).map(([key, cfg]) => {
          const count = companies.filter(c => c.status === key).length;
          const Icon = cfg.icon;
          return (
            <div key={key} className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon size={14} color={cfg.color} strokeWidth={2} />
                <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em" }}>{cfg.label}</span>
              </div>
              <span style={{ fontSize: "28px", fontWeight: "800", color: cfg.color, lineHeight: 1 }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "7px 14px", borderRadius: "7px", border: "1px solid", fontSize: "13px", fontWeight: "600", cursor: "pointer", transition: "all .15s",
              borderColor: filter === f.key ? "#3b82f6" : "var(--border)",
              background:  filter === f.key ? "#eff6ff" : "var(--card)",
              color:       filter === f.key ? "#3b82f6" : "var(--text-3)",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Company list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-3)", fontSize: "14px" }}>טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: "60px", textAlign: "center" }}>
          <Building2 size={32} color="var(--text-3)" strokeWidth={1.3} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: "14px", color: "var(--text-3)" }}>אין חברות להצגה</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map(c => (
            <CompanyCard key={c.id} c={c} onAction={load} />
          ))}
        </div>
      )}
    </div>
  );
}
