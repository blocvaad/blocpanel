"use client";
// ספקים ואימות — תור בקשות אימות, ודירוג ומחלוקות לכל ספק.
// PANEL-PAY א2 (החלטות 368–369): אימות / דחייה / הסרת אימות רצים ב-bloc, עם קוד אישור (components/ui/SupplierVerifyCard).
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { DisputesFailedNotice } from "@/components/ui/SupplierDisputes";
import SupplierVerifyCard, { type Supplier } from "@/components/ui/SupplierVerifyCard";

const FILTERS: Array<{ key: "" | Supplier["verification_status"]; label: string }> = [
  { key: "pending", label: "ממתינים" }, { key: "verified", label: "מאומתים" }, { key: "rejected", label: "נדחו" }, { key: "", label: "הכל" },
];

const LOAD_FAILED_TEXT = "לא הצלחנו לטעון את רשימת הספקים. לחצו \"רענון\" כדי לנסות שוב.";
const STALE_TEXT = "לא הצלחנו לרענן את הרשימה — ייתכן שמה שמוצג כאן לא מעודכן. לחצו \"רענון\".";

export default function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [canVerify, setCanVerify] = useState(false);
  const [filter, setFilter] = useState<"" | Supplier["verification_status"]>("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disputesFailed, setDisputesFailed] = useState(false);
  // הפעולה האחרונה שבוצעה (bloc אישר) — נשארת עד שסוגרים או עד הפעולה הבאה.
  const [done, setDone] = useState<string | null>(null);
  // סקירה א2 (#6): כשל טעינה הוא לא "אין ספקים" ולא "0 ממתינים"; כשל ברענון — הרשימה שמוצגת אולי ישנה.
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/suppliers", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (!r.ok) setError(loadedOnce ? STALE_TEXT : (j.error ?? LOAD_FAILED_TEXT));
      else { setRows(j.suppliers ?? []); setCounts(j.counts ?? {}); setCanVerify(!!j.canVerify); setDisputesFailed(!!j.disputes_failed); setLoadedOnce(true); }
    } catch { setError(loadedOnce ? STALE_TEXT : LOAD_FAILED_TEXT); }
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
          {loadedOnce && <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
            {counts.pending ?? 0} ממתינים לאימות · {counts.verified ?? 0} מאומתים · {rows.length} סה״כ
          </p>}
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

      {done && (
        <div role="status" data-suppliers-done="" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "10px", fontSize: "14px", lineHeight: 1.6, background: "#22c55e14", border: "1px solid #22c55e40", color: "var(--text)" }}>
          <span style={{ flex: 1 }}>{done}</span>
          <button type="button" onClick={() => setDone(null)} aria-label="סגירה" style={{ background: "none", border: "none", color: "var(--text-2)", minWidth: "44px", minHeight: "44px" }}>סגירה</button>
        </div>
      )}
      {error && <div className="card" style={{ padding: "16px", color: "var(--red)" }}>{error}</div>}
      <DisputesFailedNotice failed={disputesFailed} />
      {loading && <div className="card" style={{ padding: "24px", color: "var(--text-3)" }}>טוען…</div>}
      {!loading && !error && shown.length === 0 && <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>אין ספקים ברשימה הזו</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {shown.map((s) => (
          <SupplierVerifyCard key={s.id} s={s} canVerify={canVerify} onRefresh={load}
            onDone={(text) => { setDone(text); void load(); }} />
        ))}
      </div>
    </div>
  );
}
