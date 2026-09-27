"use client";
// ספקים ואימות — תור בקשות אימות, ודירוג ומחלוקות לכל ספק.
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, RefreshCw, ShieldX, Clock, Star } from "lucide-react";

type Supplier = {
  id: string; business_name: string; category: string; phone: string; email: string | null;
  verification_status: "none" | "pending" | "verified" | "rejected";
  business_license_number: string | null; professional_license_url: string | null;
  verification_rejection_reason: string | null; verified_at: string | null;
  rating: number | null; rating_count: number | null; created_at: string; open_disputes: number;
};

const VS: Record<Supplier["verification_status"], { label: string; badge: string }> = {
  none:     { label: "לא ביקש",   badge: "badge-muted" },
  pending:  { label: "ממתין לאימות", badge: "badge-yellow" },
  verified: { label: "מאומת",     badge: "badge-green" },
  rejected: { label: "נדחה",      badge: "badge-red" },
};
const FILTERS: Array<{ key: "" | Supplier["verification_status"]; label: string }> = [
  { key: "pending", label: "ממתינים" }, { key: "verified", label: "מאומתים" }, { key: "rejected", label: "נדחו" }, { key: "", label: "הכל" },
];

export default function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [canVerify, setCanVerify] = useState(false);
  const [filter, setFilter] = useState<"" | Supplier["verification_status"]>("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/suppliers", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "שגיאה");
      else { setRows(j.suppliers ?? []); setCounts(j.counts ?? {}); setCanVerify(!!j.canVerify); }
    } catch { setError("שגיאת רשת"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => rows.filter((s) =>
    (!filter || s.verification_status === filter) &&
    (!q || `${s.business_name} ${s.category} ${s.phone}`.toLowerCase().includes(q.toLowerCase()))), [rows, filter, q]);

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800 }}>ספקים ואימות</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
            {counts.pending ?? 0} ממתינים לאימות · {counts.verified ?? 0} מאומתים · {rows.length} סה״כ
          </p>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", gap: "6px", alignItems: "center", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
          <RefreshCw size={14} /> רענון
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.label} className={`chip${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)} style={{ fontSize: "13px", padding: "7px 14px" }}>
              {f.label}{f.key && counts[f.key] ? ` (${counts[f.key]})` : ""}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / תחום / טלפון"
          style={{ flex: 1, minWidth: "160px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13px" }} />
      </div>

      {error && <div className="card" style={{ padding: "16px", color: "var(--red)" }}>{error}</div>}
      {loading && <div className="card" style={{ padding: "24px", color: "var(--text-3)" }}>טוען…</div>}
      {!loading && shown.length === 0 && <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>אין ספקים ברשימה הזו</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {shown.map((s) => <SupplierCard key={s.id} s={s} canVerify={canVerify} onDone={load} />)}
      </div>
    </div>
  );
}

function SupplierCard({ s, canVerify, onDone }: { s: Supplier; canVerify: boolean; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<null | "reject" | "revoke">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const vs = VS[s.verification_status] ?? VS.none;

  const act = async (action: "verify" | "reject" | "revoke") => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/suppliers", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "verify" ? { id: s.id, action } : { id: s.id, action, reason }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "הפעולה נכשלה"); return; }
    setMode(null); setReason(""); onDone();
  };

  return (
    <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", borderColor: s.verification_status === "pending" ? "#eab30840" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 700 }}>{s.business_name}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span>{s.category}</span>
            <span style={{ fontFamily: "var(--mono)" }}>{s.phone}</span>
            {(s.rating_count ?? 0) > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}><Star size={12} />{Number(s.rating).toFixed(1)} ({s.rating_count})</span>}
            {s.open_disputes > 0 && <span style={{ color: "var(--red)" }}>{s.open_disputes} מחלוקות תשלום פתוחות</span>}
          </div>
        </div>
        <span className={`badge ${vs.badge}`} style={{ flexShrink: 0 }}>{vs.label}</span>
      </div>

      {(s.verification_status === "pending" || s.business_license_number || s.professional_license_url) && (
        <div style={{ fontSize: "13px", color: "var(--text-2)", display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {s.business_license_number && <span>עוסק/ח.פ.: <b style={{ fontFamily: "var(--mono)" }}>{s.business_license_number}</b></span>}
          {s.professional_license_url?.startsWith("https://")
            ? <a href={s.professional_license_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>תעודה מקצועית ↗</a>
            : s.verification_status === "pending" && <span style={{ color: "var(--text-3)" }}>לא צורפה תעודה</span>}
        </div>
      )}
      {s.verification_status === "rejected" && s.verification_rejection_reason && (
        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>סיבת דחייה: {s.verification_rejection_reason}</div>
      )}

      {canVerify && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(s.verification_status === "pending" || s.verification_status === "rejected") && (
            <button disabled={busy} onClick={() => act("verify")} style={btn("#10b981")}><BadgeCheck size={14} />אמת ספק</button>
          )}
          {s.verification_status === "pending" && (
            <button disabled={busy} onClick={() => setMode(mode === "reject" ? null : "reject")} style={btnGhost}><ShieldX size={14} />דחה</button>
          )}
          {s.verification_status === "verified" && (
            <button disabled={busy} onClick={() => setMode(mode === "revoke" ? null : "revoke")} style={btnGhost}><ShieldX size={14} />הסר אימות</button>
          )}
        </div>
      )}
      {mode && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה — תישלח לספק"
            style={{ flex: 1, minWidth: "180px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13px" }} />
          <button disabled={busy || reason.trim().length < 3} onClick={() => act(mode)} style={{ ...btn("#ef4444"), opacity: reason.trim().length < 3 ? 0.5 : 1 }}>
            <Clock size={14} />{mode === "reject" ? "אישור דחייה" : "אישור הסרה"}
          </button>
        </div>
      )}
      {msg && <div style={{ fontSize: "12px", color: "var(--red)" }}>{msg}</div>}
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "none", background: bg, color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" });
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "13px", cursor: "pointer" };
