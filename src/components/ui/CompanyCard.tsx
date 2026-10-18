"use client";
// כרטיס של חברת ניהול בפאנל (bloc REG-2): מה צוות bloc צריך כדי להחליט — מספר העסק וסוגו, טלפון, מייל, כתובת
// המשרד, היקף התיק, הערים, התיאור, הבעלים והבניין שלו, מתי נשלחה ואם עודכנה אחרי כן, הסיבה של ההחלטה האחרונה,
// ומה קרה עם הבקשה עד עכשיו (היסטוריה, נטענת כשהכרטיס נפתח). ההחלטות — רק מה שאפשר מהמצב הנוכחי, ורק למי
// שרשאי (canDecide); החלון עצמו — CompanyDecisionModal. המסלול והענקתו (125) — כמו קודם.
import { useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Gift, History, AlertTriangle } from "lucide-react";
import { Banner, Tag, ghostBtn, solidBtn } from "./panelKit";
import { companyLifecycle, companySummary, COMPANY_LIFECYCLE_LABEL } from "@/lib/entitlementView";
import { MGMT_PLAN_OPTIONS } from "@/lib/plans";
import {
  STATUS_LABEL, PORTFOLIO_LABEL, actionsFor, buttonLabel, editedAfterSend, fullWhen, taxText, waitingText, whenText,
  type Company, type CompanyAction, type CompanyStatus, type HistoryItem,
} from "@/lib/companies";

const STATUS_TONE: Record<CompanyStatus, "wait" | "ok" | "danger" | "muted"> = {
  pending_approval: "wait", active: "ok", rejected: "danger", suspended: "muted",
};
// פעילה — "מאז" (אישור או ביטול השעיה: מהשורה לא ידוע איזה מהם; ההיסטוריה בכרטיס אומרת).
const DECIDED_VERB: Partial<Record<CompanyStatus, string>> = { active: "פעילה מאז", rejected: "נדחתה", suspended: "הושעתה" };
const TONE_COLOR: Record<string, { color: string; bg: string }> = {
  green: { color: "#10b981", bg: "#10b98118" }, blue: { color: "#3b82f6", bg: "#3b82f618" },
  yellow: { color: "#f59e0b", bg: "#f59e0b18" }, red: { color: "#ef4444", bg: "#ef444418" }, muted: { color: "#6b7280", bg: "#6b728018" },
};

/** שורת הזמן בכותרת: בקשה ממתינה — כמה זמן היא בתור; אחרת — מתי הוחלט (או נפתחה, לחברה מלפני REG-2). */
export function cardWhen(c: Company, now: Date = new Date()): string {
  if (c.status === "pending_approval") return waitingText(c.submitted_at ?? c.created_at, now) ?? "";
  const verb = DECIDED_VERB[c.status];
  if (c.decided_at && verb) return `${verb} ${whenText(c.decided_at, now)}`;
  return `נפתחה ${whenText(c.created_at, now) ?? ""}`.trim();
}

function Fact({ label, children, ltr, k }: { label: string; children: React.ReactNode; ltr?: boolean; k: string }) {
  return (
    <div data-fact={k} style={{ minWidth: 0 }}>
      <dt style={{ fontSize: "12.5px", color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ fontSize: "14.5px", color: "var(--text)", marginTop: "2px", wordBreak: "break-word" }} dir={ltr ? "ltr" : undefined}>{children}</dd>
    </div>
  );
}

export function CompanyFacts({ c }: { c: Company }) {
  const tax = taxText(c.tax_id);
  const sent = c.submitted_at ?? c.created_at;
  const edited = editedAfterSend(c);
  const owner = c.owner;
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px 18px" }}>
      <Fact k="tax" label="ח.פ. / ע.מ.">
        {tax ? <>
          <span dir="ltr" style={{ fontFamily: "var(--mono)" }}>{tax.digits}</span>
          <span style={{ fontSize: "13px", color: tax.ok ? "var(--text-2)" : "var(--yellow)", marginInlineStart: "8px" }}>{tax.note}</span>
        </> : <span style={{ color: "var(--yellow)" }}>לא נמסר</span>}
      </Fact>
      <Fact k="phone" label="טלפון">
        {c.phone ? <a href={`tel:${c.phone}`} dir="ltr" style={{ color: "var(--text)", textDecoration: "none" }}>{c.phone}</a> : "לא נמסר"}
      </Fact>
      <Fact k="email" label="מייל החברה">
        {c.email ? <a href={`mailto:${c.email}`} dir="ltr" style={{ color: "var(--text)", textDecoration: "none" }}>{c.email}</a> : "לא נמסר"}
      </Fact>
      <Fact k="office" label="המשרד">{c.office_address?.trim() || "לא נמסר"}</Fact>
      <Fact k="portfolio" label="בניינים בתיק היום">{(c.portfolio_size && PORTFOLIO_LABEL[c.portfolio_size]) || "לא נמסר"}</Fact>
      <Fact k="owner" label="הבעלים">
        <span>{owner?.full_name?.trim() || "ללא שם"}</span>
        {owner?.email && <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)" }}><bdi>{owner.email}</bdi></span>}
        <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)" }}>
          {owner?.building_name ? `גר/ה ב${owner.building_name}` : "בלי בניין ב-bloc"}
        </span>
      </Fact>
      <Fact k="code" label="קוד החברה">
        {c.invite_code ? <span dir="ltr" style={{ fontFamily: "var(--mono)", color: "var(--blue)" }}>{c.invite_code}</span> : "—"}
      </Fact>
      <Fact k="sent" label="נשלחה">
        <span title={fullWhen(sent)}>{whenText(sent) ?? "—"}</span>
        {edited && <span style={{ display: "block", fontSize: "13px", color: "var(--yellow)" }} data-fact-edited="">עודכנה {whenText(c.details_updated_at)}</span>}
      </Fact>
      {c.decided_at && <Fact k="decided" label="ההחלטה האחרונה"><span title={fullWhen(c.decided_at)}>{whenText(c.decided_at)}</span></Fact>}
    </dl>
  );
}

export function HistoryList({ items }: { items: HistoryItem[] }) {
  if (!items.length) return <p style={{ fontSize: "13.5px", color: "var(--text-3)" }}>אין עדיין רישום.</p>;
  return (
    <ol style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }} data-history="">
      {items.map((h) => (
        <li key={h.id} style={{ borderInlineStart: "2px solid var(--border-2)", paddingInlineStart: "10px" }} data-history-item={h.id}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
            <b style={{ fontSize: "14px", color: "var(--text)" }}>{h.label}</b>
            <span style={{ fontSize: "13px", color: "var(--text-2)" }}>{h.who}</span>
            {h.email && <bdi style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{h.email}</bdi>}
            <span style={{ fontSize: "12.5px", color: "var(--text-3)" }} title={fullWhen(h.at)}>{whenText(h.at)}</span>
          </div>
          {h.reason && <p style={{ fontSize: "13.5px", color: "var(--text)", marginTop: "3px", whiteSpace: "pre-line" }}>הסיבה לחברה: {h.reason}</p>}
          {h.note && <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "2px", whiteSpace: "pre-line" }}>תיעוד: {h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function BillingBox({ c, canGrant, onAction }: { c: Company; canGrant: boolean; onAction: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [grantPlan, setGrantPlan] = useState("mgmt_start");
  const [grantReason, setGrantReason] = useState("");
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  if (!c.billing) return null;
  const lc = companyLifecycle(c.billing);
  const lcCfg = COMPANY_LIFECYCLE_LABEL[lc];

  const doGrant = async (action: "grant" | "end_grant") => {
    setLoading(action); setGrantMsg(null);
    const res = await fetch("/api/management-companies/billing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "grant" ? { id: c.id, action, plan: grantPlan, reason: grantReason } : { id: c.id, action }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) { setGrantMsg(j.error ?? "הפעולה נכשלה"); return; }
    setGrantReason("");
    onAction();
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-3)" }}>מסלול וחיוב</div>
      <div style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.7 }}>
        <div>{lcCfg.label}: {companySummary(c.billing)}</div>
        <div>בניינים בתיק: {c.billing.active_buildings}{c.billing.pending_buildings ? `, ועוד ${c.billing.pending_buildings} בקשות ממתינות` : ""}</div>
        <div>מנוי PayPlus: {c.billing.live_subscription_status ? `${c.billing.live_subscription_status}, ₪${Number(c.billing.live_amount ?? 0).toLocaleString("he-IL")}` : "אין"}</div>
      </div>
      {canGrant && c.status === "active" && (
        lc === "comp" ? (
          <button onClick={() => doGrant("end_grant")} disabled={!!loading} style={{ ...ghostBtn, alignSelf: "flex-start" }}>
            {loading === "end_grant" ? "מסיים..." : "סיום המסלול המוענק (הבניינים עוברים לחסד)"}
          </button>
        ) : !c.billing.live_subscription_status ? (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <Gift size={14} color="var(--text-3)" />
            <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)}
              style={{ minHeight: "44px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13.5px" }}>
              {MGMT_PLAN_OPTIONS.filter((p) => p.value !== "mgmt_free").map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input value={grantReason} onChange={(e) => setGrantReason(e.target.value)} placeholder="סיבה (פיילוט, שותפות...)"
              style={{ flex: 1, minWidth: "140px", minHeight: "44px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13.5px" }} />
            <button onClick={() => doGrant("grant")} disabled={!!loading || grantReason.trim().length < 3}
              style={{ ...solidBtn("#3b82f6"), minHeight: "44px", fontSize: "13.5px", opacity: grantReason.trim().length < 3 ? 0.5 : 1 }}>
              {loading === "grant" ? "מעניק..." : "הענקת מסלול ללא תשלום"}
            </button>
          </div>
        ) : null
      )}
      {grantMsg && <div style={{ fontSize: "13px", color: "#ef4444" }}>{grantMsg}</div>}
    </div>
  );
}

export default function CompanyCard({ c, canGrant, canDecide, onAction, onDecide, defaultOpen = false }: {
  c: Company; canGrant: boolean; canDecide: boolean
  onAction: () => void
  onDecide: (c: Company, action: CompanyAction) => void
  defaultOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const lcCfg = c.billing ? COMPANY_LIFECYCLE_LABEL[companyLifecycle(c.billing)] : null;
  const actions = canDecide ? actionsFor(c.status) : [];
  const edited = c.status === "pending_approval" && editedAfterSend(c);
  const reason = (c.status === "rejected" || (c.status === "suspended" && c.decided_at)) ? c.reject_reason?.trim() || null : null;

  // ההיסטוריה — כשהכרטיס נפתח, פעם אחת (ושוב אחרי החלטה: הכרטיס נטען מחדש עם decided_at חדש).
  useEffect(() => {
    if (!expanded) return;
    let off = false;
    setHistoryError(false);
    fetch(`/api/management-companies?history=${encodeURIComponent(c.id)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!off) setHistory(Array.isArray(j.history) ? j.history : []); })
      .catch(() => { if (!off) setHistoryError(true); });
    return () => { off = true; };
  }, [expanded, c.id, c.decided_at, c.details_updated_at, c.status]);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }} data-company={c.id} data-company-status={c.status}>
      <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} data-company-toggle=""
        style={{ width: "100%", minHeight: "64px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", background: "transparent", border: "none", textAlign: "right", color: "var(--text)", cursor: "pointer" }}>
        <span aria-hidden style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#3b82f618", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Building2 size={20} color="#3b82f6" strokeWidth={1.7} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "15.5px", fontWeight: 700 }}>{c.name}</span>
            <Tag tone={STATUS_TONE[c.status] ?? "muted"}>{STATUS_LABEL[c.status] ?? c.status}</Tag>
            {edited && <Tag tone="info">עודכנה אחרי השליחה</Tag>}
            {c.billing && lcCfg && (
              <span style={{ fontSize: "12px", fontWeight: 600, padding: "2px 10px", borderRadius: "99px", background: TONE_COLOR[lcCfg.tone].bg, color: TONE_COLOR[lcCfg.tone].color }}>
                {companySummary(c.billing)}
              </span>
            )}
          </span>
          <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)", marginTop: "3px" }}>
            {c.owner?.full_name?.trim() || "ללא שם"}
          </span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
          <span style={{ fontSize: "12.5px", color: c.status === "pending_approval" ? "var(--yellow)" : "var(--text-3)" }} data-company-when="">{cardWhen(c)}</span>
          {expanded ? <ChevronUp size={16} color="var(--text-3)" /> : <ChevronDown size={16} color="var(--text-3)" />}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }} data-company-body="">
          {edited && <Banner tone="warn">הבעלים עדכן את הבקשה אחרי שנשלחה ({whenText(c.details_updated_at)}). עברו על הפרטים לפני שמחליטים.</Banner>}
          <CompanyFacts c={c} />

          {(c.coverage_areas ?? []).length > 0 && (
            <div data-company-areas="">
              <div style={{ fontSize: "12.5px", color: "var(--text-3)", marginBottom: "6px" }}>ערים ({(c.coverage_areas ?? []).length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(c.coverage_areas ?? []).map((a) => (
                  <span key={a} style={{ fontSize: "13px", padding: "4px 10px", borderRadius: "99px", background: "#3b82f618", color: "var(--text)" }}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {c.description?.trim() && (
            <div>
              <div style={{ fontSize: "12.5px", color: "var(--text-3)", marginBottom: "4px" }}>על החברה</div>
              <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.7, whiteSpace: "pre-line" }}>{c.description}</p>
            </div>
          )}

          {reason && (
            <div style={{ display: "flex", gap: "10px", padding: "12px 14px", borderRadius: "10px", background: "#eab30812", border: "1px solid #eab30835" }} data-company-reason="">
              <AlertTriangle size={16} color="#eab308" style={{ flexShrink: 0, marginTop: "3px" }} />
              <div>
                <div style={{ fontSize: "12.5px", color: "var(--text-3)" }}>הסיבה שנמסרה לחברה</div>
                <p style={{ fontSize: "14px", color: "var(--text)", whiteSpace: "pre-line", marginTop: "2px" }}>{reason}</p>
              </div>
            </div>
          )}

          <BillingBox c={c} canGrant={canGrant} onAction={onAction} />

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-3)", marginBottom: "8px" }}>
              <History size={14} /> מה קרה עם הבקשה
            </div>
            {historyError ? <p style={{ fontSize: "13.5px", color: "var(--text-3)" }}>טעינת ההיסטוריה נכשלה.</p>
              : history === null ? <p style={{ fontSize: "13.5px", color: "var(--text-3)" }}>טוען…</p>
              : <HistoryList items={history} />}
          </div>

          {actions.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingTop: "12px", borderTop: "1px solid var(--border)" }} data-company-actions="">
              {actions.map((a) => {
                const positive = a === "approve" || a === "reactivate";
                return (
                  <button key={a} type="button" onClick={() => onDecide(c, a)} data-company-action={a}
                    style={positive ? { ...solidBtn("var(--blue)"), flex: 1 } : { ...ghostBtn, flex: 1, minHeight: "48px", color: "#ef4444", borderColor: "#ef444455" }}>
                    {buttonLabel(a, c.status)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
