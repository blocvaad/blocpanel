"use client";
// src/components/ui/SupplierVerifyCard.tsx — כרטיס ספק בתור האימות: פרטים, דירוג, מחלוקות, ואימות / דחייה / הסרת אימות.
//
// PANEL-PAY א2 (החלטות 368–369): הפעולה רצה ב-bloc (סטטוס, הודעה לספק, יומן), עם קוד אישור — stepUpFetch פותח את חלון
// הקוד ("אימות הספק …") ושולח שוב פעם אחת. הצלחה רק כש-bloc אישר (ok === true); מצב שהשתנה / תשובה לא ברורה — הודעה עם
// "רענון"; ביטול חלון הקוד — "הפעולה לא בוצעה".
// SupplierVerifyCardView — התצוגה בלבד (props → markup), לבדיקה בשרת (בפאנל אין happy-dom) ולצילומי המסך.
import { useState } from "react";
import { BadgeCheck, ShieldX, Clock, Star, RefreshCw } from "lucide-react";
import { DisputesBadge } from "./SupplierDisputes";
import StepUpNote from "./StepUpNote";
import { stepUpFetch } from "@/lib/stepUpClient";
import { STEP_UP_WHAT, afterSupplierAction, type SupplierAction, type SupplierNotice } from "@/lib/blocActionsUi";

/** א3-1: viewer — יש תעודה, בלי קישור (לא "לא צורפה"). */
export const LICENSE_HIDDEN_TEXT = "צורפה תעודה מקצועית — רק מנהל יכול לפתוח";

export type Supplier = {
  id: string; business_name: string; category: string; phone: string; email: string | null;
  verification_status: "none" | "pending" | "verified" | "rejected";
  business_license_number: string | null; professional_license_url: string | null;
  verification_rejection_reason: string | null; verified_at: string | null;
  rating: number | null; rating_count: number | null; created_at: string; open_disputes: number | null;
  /** א3-1: יש תעודה, אבל התפקיד הזה (viewer) לא מקבל קישור אליה. */
  license_hidden?: boolean;
};

export const VS: Record<Supplier["verification_status"], { label: string; badge: string }> = {
  none:     { label: "לא ביקש",   badge: "badge-muted" },
  pending:  { label: "ממתין לאימות", badge: "badge-yellow" },
  verified: { label: "מאומת",     badge: "badge-green" },
  rejected: { label: "נדחה",      badge: "badge-red" },
};

export type SupplierCardViewProps = {
  s: Supplier;
  canVerify: boolean;
  mode: null | "reject" | "revoke";
  reason: string;
  busy: boolean;
  notice: SupplierNotice | null;
  onAct?: (action: SupplierAction) => void;
  onMode?: (mode: null | "reject" | "revoke") => void;
  onReason?: (v: string) => void;
  onRefresh?: () => void;
};

const btn = (bg: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", minHeight: "40px", borderRadius: "8px", border: "none", background: bg, color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" });
const btnGhost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", minHeight: "40px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "13px", cursor: "pointer" };

export function SupplierVerifyCardView({ s, canVerify, mode, reason, busy, notice, onAct, onMode, onReason, onRefresh }: SupplierCardViewProps) {
  const vs = VS[s.verification_status] ?? VS.none;
  const canAccept = s.verification_status === "pending" || s.verification_status === "rejected";
  const canReject = s.verification_status === "pending";
  const canRevoke = s.verification_status === "verified";
  const anyAction = canVerify && (canAccept || canReject || canRevoke);
  const reasonOk = reason.trim().length >= 3;
  return (
    <div className="card" data-supplier-card={s.verification_status} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", borderColor: s.verification_status === "pending" ? "#eab30840" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 700 }}>{s.business_name}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span>{s.category}</span>
            <span style={{ fontFamily: "var(--mono)" }}>{s.phone}</span>
            {(s.rating_count ?? 0) > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}><Star size={12} />{Number(s.rating).toFixed(1)} ({s.rating_count})</span>}
            <DisputesBadge count={s.open_disputes} />
          </div>
        </div>
        <span className={`badge ${vs.badge}`} style={{ flexShrink: 0 }}>{vs.label}</span>
      </div>

      {(s.verification_status === "pending" || s.business_license_number || s.professional_license_url || s.license_hidden) && (
        <div style={{ fontSize: "13px", color: "var(--text-2)", display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {s.business_license_number && <span>עוסק/ח.פ.: <b style={{ fontFamily: "var(--mono)" }}>{s.business_license_number}</b></span>}
          {s.professional_license_url?.startsWith("https://")
            ? <a href={s.professional_license_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>תעודה מקצועית ↗</a>
            : s.license_hidden ? <span style={{ color: "var(--text-3)" }}>{LICENSE_HIDDEN_TEXT}</span>
            : s.verification_status === "pending" && <span style={{ color: "var(--text-3)" }}>לא צורפה תעודה</span>}
        </div>
      )}
      {s.verification_status === "rejected" && s.verification_rejection_reason && (
        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>סיבת דחייה: {s.verification_rejection_reason}</div>
      )}

      {anyAction && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {canAccept && (
            <button type="button" disabled={busy} onClick={() => onAct?.("verify")} data-supplier-act="verify" style={{ ...btn("#10b981"), opacity: busy ? 0.6 : 1 }}>
              <BadgeCheck size={14} />{busy && !mode ? "שולחים…" : "אמת ספק"}
            </button>
          )}
          {canReject && (
            <button type="button" disabled={busy} onClick={() => onMode?.(mode === "reject" ? null : "reject")} data-supplier-act="reject" style={btnGhost}><ShieldX size={14} />דחה</button>
          )}
          {canRevoke && (
            <button type="button" disabled={busy} onClick={() => onMode?.(mode === "revoke" ? null : "revoke")} data-supplier-act="revoke" style={btnGhost}><ShieldX size={14} />הסר אימות</button>
          )}
        </div>
      )}
      {anyAction && mode && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} data-supplier-reason="">
          <input value={reason} onChange={(e) => onReason?.(e.target.value)} placeholder="סיבה — תישלח לספק" aria-label="סיבה — תישלח לספק"
            style={{ flex: 1, minWidth: "180px", padding: "8px 12px", minHeight: "40px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13px" }} />
          <button type="button" disabled={busy || !reasonOk} onClick={() => onAct?.(mode)} data-supplier-confirm={mode} style={{ ...btn("#ef4444"), opacity: busy || !reasonOk ? 0.5 : 1, cursor: busy || !reasonOk ? "not-allowed" : "pointer" }}>
            <Clock size={14} />{busy ? "שולחים…" : mode === "reject" ? "אישור דחייה" : "אישור הסרה"}
          </button>
        </div>
      )}
      {anyAction && <StepUpNote text="אימות, דחייה והסרת אימות מאושרים בקוד חד-פעמי מהמייל (פעם ב-10 דקות)." />}
      {notice && notice.tone === "error" && (
        <div role="alert" data-supplier-error={notice.refresh ? "refresh" : "plain"} style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: "10px", background: "#ef444414", border: "1px solid #ef444440", fontSize: "13px", color: "var(--text)", lineHeight: 1.6 }}>
          <span style={{ flex: "1 1 200px" }}>{notice.text}</span>
          {notice.refresh && onRefresh && (
            <button type="button" onClick={onRefresh} data-supplier-refresh="" style={{ ...btnGhost, color: "var(--text)" }}><RefreshCw size={14} />רענון</button>
          )}
        </div>
      )}
    </div>
  );
}

/** הכרטיס עם המצב שלו. onDone(text) — הפעולה בוצעה (הדף מראה את ההודעה ורענן את הרשימה); onRefresh — רענון הרשימה. */
export default function SupplierVerifyCard({ s, canVerify, onDone, onRefresh }: { s: Supplier; canVerify: boolean; onDone: (text: string) => void; onRefresh: () => void }) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<null | "reject" | "revoke">(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SupplierNotice | null>(null);

  const act = async (action: SupplierAction) => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const res = await stepUpFetch("/api/suppliers", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "verify" ? { id: s.id, action } : { id: s.id, action, reason: reason.trim() }),
      }, { what: STEP_UP_WHAT[action](s.business_name) });
      const j = await res.json().catch(() => ({}));
      const o = afterSupplierAction(res, j, action, s.business_name);
      setBusy(false);
      if (o.done) { setMode(null); setReason(""); onDone(o.notice.text); return; }
      setNotice(o.notice);
    } catch {
      setBusy(false);
      setNotice({ tone: "error", text: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.", refresh: false });
    }
  };

  return (
    <SupplierVerifyCardView s={s} canVerify={canVerify} mode={mode} reason={reason} busy={busy} notice={notice}
      onAct={(a) => void act(a)} onMode={(m) => { setMode(m); setNotice(null); }} onReason={setReason} onRefresh={onRefresh} />
  );
}
