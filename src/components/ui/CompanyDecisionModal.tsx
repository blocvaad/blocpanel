"use client";
// ההחלטה על חברת ניהול (bloc REG-2): אישור / דחייה / השעיה / ביטול השעיה. החלון אומר מה יקרה, מבקש סיבה לחברה
// בדחייה ובהשעיה (נשלחת לבעלים), ותיעוד פנימי (לא נשלח). הבקשה הולכת ל-/api/management-companies (→ bloc), על
// המצב והפרטים שעל המסך. השתנו בינתיים, או שלא ידוע אם ההחלטה נשמרה — השגיאה בחלון, וכפתור לרענון הרשימה.
import { useState } from "react";
import { Modal, Banner, ghostBtn, solidBtn, fieldLabel, textareaStyle } from "./panelKit";
import {
  DECISION_COPY, REASON_MAX, decisionPayload, deliveryOf, editedAfterSend, needsReason, offersRefresh, reasonIssue,
  type Company, type CompanyAction, type Delivery,
} from "@/lib/companies";

export type DecisionDone = { action: CompanyAction } & Delivery;

type Result = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; code?: string };

export async function patchCompany(body: Record<string, unknown>): Promise<Result> {
  try {
    const r = await fetch("/api/management-companies", {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // בלי תשובה מסודרת (502–504 של השער): ייתכן שההחלטה נשמרה — כמו TIMEOUT.
      const code = typeof j.code === "string" ? j.code : r.status >= 502 && r.status <= 504 ? "TIMEOUT" : undefined;
      const fallback = code === "TIMEOUT" ? "לא התקבלה תשובה. ייתכן שההחלטה נשמרה — רעננו לפני שמנסים שוב." : "ההחלטה נכשלה. נסו שוב.";
      return { ok: false, error: typeof j.error === "string" ? j.error : fallback, code };
    }
    return { ok: true, data: j as Record<string, unknown> };
  } catch {
    return { ok: false, error: "אין חיבור לשרת. בדקו את החיבור, רעננו ונסו שוב.", code: "NETWORK" };
  }
}

export default function CompanyDecisionModal({ company, action, onClose, onDone, onStale }: {
  company: Company; action: CompanyAction
  onClose: () => void
  onDone: (d: DecisionDone) => void
  /** מה שעל המסך כבר לא המצב: סוגרים ומרעננים. */
  onStale: () => void
}) {
  const copy = DECISION_COPY[action];
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; stale: boolean } | null>(null);
  const issue = reasonIssue(action, reason);
  const ready = !issue && !busy;
  const name = company.name?.trim() || "החברה";
  const edited = company.status === "pending_approval" && editedAfterSend(company);

  const submit = async () => {
    setBusy(true); setError(null);
    const r = await patchCompany(decisionPayload(company, action, { reason, note }));
    setBusy(false);
    if (!r.ok) { setError({ text: r.error, stale: offersRefresh(r.code) }); return; }
    onDone({ action, ...deliveryOf(r.data) });
  };

  return (
    <Modal title={copy.title} onClose={onClose} busy={busy}>
      <div data-decision-what="">
        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{name}</div>
        <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7, marginTop: "4px" }}>{copy.consequence}</p>
      </div>
      {edited && action === "approve" && (
        <Banner tone="warn">הבעלים עדכן את הבקשה אחרי שנשלחה. ודאו שעברתם על הפרטים העדכניים לפני האישור.</Banner>
      )}
      {needsReason(action) && (
        <label style={fieldLabel}>
          <span>הסיבה לחברה (נשלחת לבעלים במייל ובהודעה)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} style={textareaStyle} data-decision-reason=""
            placeholder={action === "reject" ? "למשל: מספר העסק לא נמצא ברשם החברות. בדקו את המספר והגישו שוב." : "למשל: חוב פתוח של שלושה חודשים במסלול החברה."} />
          {reason.trim().length > 0 && issue && <span style={{ fontSize: "13px", color: "var(--yellow)" }} data-decision-issue="">{issue}</span>}
        </label>
      )}
      <label style={fieldLabel}>
        <span>תיעוד פנימי: מה נבדק (לא נשלח לחברה)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ ...textareaStyle, minHeight: "72px" }} data-decision-note=""
          placeholder="למשל: ח.פ. אומת ברשם החברות, דיברנו עם הבעלים בטלפון" />
      </label>
      {error && (
        <Banner tone="error" action={error.stale ? <button type="button" onClick={onStale} style={ghostBtn} data-decision-refresh="">רענון הרשימה</button> : undefined}>
          {error.text}
        </Banner>
      )}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button type="button" onClick={onClose} disabled={busy} style={{ ...ghostBtn, flex: 1, minHeight: "48px" }}>סגירה</button>
        <button type="button" onClick={submit} disabled={!ready} data-decision-submit={action}
          style={{ ...solidBtn(copy.tone === "danger" ? "#ef4444" : "var(--blue)"), flex: 2, opacity: ready ? 1 : 0.5 }}>
          {busy ? "שולחים…" : copy.submit}
        </button>
      </div>
    </Modal>
  );
}
