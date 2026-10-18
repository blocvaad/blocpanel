'use client'
// חברות ניהול (bloc REG-2): התור של הבקשות (הוותיקה קודם), הכרטיס של כל חברה עם מה שצריך כדי להחליט, וההחלטה
// עצמה — דרך bloc, על המצב שעל המסך, עם סיבה לחברה בדחייה ובהשעיה. אחרי החלטה — הודעה במילים, והרשימה נטענת
// מחדש. viewer רואה הכל ולא מחליט.
import { useCallback, useEffect, useState } from "react";
import { Building2, Check, X, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import CompanyCard from "@/components/ui/CompanyCard";
import CompanyDecisionModal, { type DecisionDone } from "@/components/ui/CompanyDecisionModal";
import { Banner } from "@/components/ui/panelKit";
import { STATUS_LABEL, deliveredAll, doneText, sortCompanies, type Company, type CompanyAction, type CompanyStatus } from "@/lib/companies";

type Filter = "all" | CompanyStatus;

const STATUS_CARD: { key: CompanyStatus; color: string; Icon: typeof Clock }[] = [
  { key: "pending_approval", color: "#f59e0b", Icon: Clock },
  { key: "active",           color: "#10b981", Icon: Check },
  { key: "rejected",         color: "#ef4444", Icon: X },
  { key: "suspended",        color: "#6b7280", Icon: AlertTriangle },
];

export default function ManagementCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [canGrant,  setCanGrant]  = useState(false);
  const [canDecide, setCanDecide] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter,    setFilter]    = useState<Filter>("pending_approval");
  const [deciding,  setDeciding]  = useState<{ c: Company; action: CompanyAction } | null>(null);
  const [done,      setDone]      = useState<{ text: string; warn: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const r = await fetch("/api/management-companies", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadError(d.error ?? "טעינת חברות הניהול נכשלה."); return; }
      setCompanies(d.companies ?? []);
      setCanGrant(!!d.canGrant);
      setCanDecide(!!d.canDecide);
    } catch {
      setLoadError("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const count = (s: CompanyStatus) => companies.filter((c) => c.status === s).length;
  const pendingCount = count("pending_approval");
  const filtered = sortCompanies(filter === "all" ? companies : companies.filter((c) => c.status === filter));

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "pending_approval", label: `ממתינות (${pendingCount})` },
    { key: "active",           label: "פעילות" },
    { key: "suspended",        label: "מושעות" },
    { key: "rejected",         label: "נדחו" },
    { key: "all",              label: "הכל" },
  ];

  const onDone = (d: DecisionDone) => {
    setDeciding(null);
    setDone({ text: doneText(d.action, d), warn: !deliveredAll(d) });
    load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>חברות ניהול</h1>
          <p style={{ fontSize: "13.5px", color: "var(--text-3)", marginTop: "3px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span>{companies.length} חברות</span>
            {pendingCount > 0 && <span style={{ color: "#f59e0b", fontWeight: 600 }} data-pending-count="">{pendingCount} ממתינות לאישור</span>}
          </p>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: "6px", minHeight: "44px", padding: "0 14px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-2)", fontSize: "13.5px", cursor: "pointer" }}>
          <RefreshCw size={14} strokeWidth={1.7} /> רענון
        </button>
      </div>

      {done && <Banner tone={done.warn ? "warn" : "ok"}>{done.text}</Banner>}
      {loadError && <Banner tone="error">{loadError}</Banner>}

      {/* Summary cards */}
      <div className="stat-grid">
        {STATUS_CARD.map(({ key, color, Icon }) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className="card" data-status-card={key}
            style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "6px", textAlign: "right", cursor: "pointer", borderColor: filter === key ? color : undefined }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon size={14} color={color} strokeWidth={2} />
              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-3)" }}>{STATUS_LABEL[key]}</span>
            </span>
            <span style={{ fontSize: "26px", fontWeight: 800, color, lineHeight: 1 }}>{count(key)}</span>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="chips" style={{ gap: "6px" }}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`chip${filter === f.key ? " active" : ""}`} style={{ minHeight: "44px" }} data-filter={f.key}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Company list */}
      {loading && companies.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-3)", fontSize: "14px" }}>טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: "48px 20px", textAlign: "center" }}>
          <Building2 size={32} color="var(--text-3)" strokeWidth={1.3} style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: "14px", color: "var(--text-3)" }}>{filter === "pending_approval" ? "אין בקשות שממתינות לאישור." : "אין חברות להצגה."}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((c) => (
            <CompanyCard key={c.id} c={c} canGrant={canGrant} canDecide={canDecide} onAction={load}
              onDecide={(company, action) => { setDone(null); setDeciding({ c: company, action }); }} />
          ))}
        </div>
      )}

      {deciding && (
        <CompanyDecisionModal company={deciding.c} action={deciding.action} onClose={() => setDeciding(null)} onDone={onDone}
          onStale={() => { setDeciding(null); load(); }} />
      )}
    </div>
  );
}
