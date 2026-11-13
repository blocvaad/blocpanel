"use client";
// src/components/ui/BillingTasks.tsx — "משימות" ו"החזרים והכחשות" בעמוד החיוב (BILL-1a).
// נפרד מהעמוד כדי שיהיה מרונדר בבדיקה עם הצורה המדויקת ש-/api/billing מחזיר. נכשל ≠ ריק ≠ טוען:
// null = "הקריאה נכשלה — נסו לרענן"; [] = "אין"; טעינה — ברמת העמוד ("טוען…").
// הפעולה עוברת ל-POST /api/billing/tasks (bloc החתום); הפאנל לא כותב לטבלאות.
import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { anyPlanLabel } from "@/lib/plans";
import {
  TASK_KIND_HINT, REFUND_KIND_LABELS, REFUND_CLASS_LABELS, REFUND_OUTCOME_LABELS, REFUND_PRODUCT_LABELS,
} from "@/lib/billing";

export type BillingTask = {
  id: string; kind: string; kind_label: string; created_at: string;
  owner_type: string; owner_name: string | null; subscription_id: string | null;
  plan_id: string | null; amount: number | string | null; sub_status: string | null; current_period_end: string | null;
  /** בוליאני בלבד — ה-uid של הוראת הקבע לא יוצא מה-route. */
  has_recurring: boolean;
  sub_read_failed?: boolean;
  /** BILL-1b: "הבניין מושעה" / "הבניין בארכיון" (מ-/api/billing), או null. */
  owner_state?: string | null;
};
export type BillingRefund = {
  id: string; provider: string; kind: string; product: string; amount: number | string; currency: string | null;
  classification: string; outcome: string; subscription_id: string | null;
  owner_type: string; owner_name: string | null; occurred_at: string;
};
export type ResolveFn = (task: BillingTask, action: "done" | "dismiss", note: string) => Promise<{ ok: boolean; message: string }>;

export const STOP_NOTE_HINT = "גם אם לא נמצאה הוראת קבע ב-PayPlus — לחצו 'עצרתי' וכתבו זאת בתיעוד.";
export const NOTE_MIN = 10;
/** תיעוד תקף לסגירה: אחרי trim, לפחות NOTE_MIN תווים (כמו ה-zod ב-route וה-RPC ב-bloc). */
export const noteOk = (n: string) => n.trim().length >= NOTE_MIN;
const OWNER_LABEL: Record<string, string> = { building: "בניין", management_company: "חברת ניהול", supplier: "ספק" };
const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "18px" };
const h2: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "var(--text-3)", marginBottom: "12px" };
const muted: React.CSSProperties = { color: "var(--text-3)", fontSize: "14px" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "—");
const ils = (n: unknown) => `₪${Number(n ?? 0).toLocaleString("he-IL")}`;

export function BillingTasks({ tasks, canManage = true, onResolve }: { tasks: BillingTask[] | null; canManage?: boolean; onResolve?: ResolveFn }) {
  return (
    <div style={card} data-billing-area="tasks">
      <div style={h2}>משימות{tasks ? ` (${tasks.length})` : ""}</div>
      {tasks === null ? (
        <div data-billing-failed="tasks" style={{ color: "var(--red)", fontSize: "14px" }}>הקריאה נכשלה — נסו לרענן.</div>
      ) : tasks.length === 0 ? (
        <div data-billing-empty="tasks" style={muted}>אין משימות פתוחות.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {tasks.map((t) => <TaskItem key={t.id} task={t} canManage={canManage} onResolve={onResolve} />)}
        </div>
      )}
    </div>
  );
}

function TaskItem({ task: t, canManage, onResolve }: { task: BillingTask; canManage: boolean; onResolve?: ResolveFn }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isStop = t.kind === "manual_stop_recurring";
  // BILL-1b: משימות שנסגרות רק ב"עצרתי" (עצירה ידנית; הוראה ישנה אחרי שדרוג) — לא "סגירה בלי טיפול".
  const isOldStop = t.kind === "stop_old_recurring";
  const closesWithStopped = isStop || isOldStop;
  const valid = noteOk(note);

  const submit = async (action: "done" | "dismiss") => {
    if (!onResolve || !valid || busy) return;
    setBusy(true); setMsg(null);
    try { const r = await onResolve(t, action, note.trim()); setMsg({ ok: r.ok, text: r.message }); }
    catch { setMsg({ ok: false, text: "שגיאת רשת — הפעולה אולי לא נשמרה, רעננו לפני שמנסים שוב." }); }
    setBusy(false);
  };

  return (
    <div data-billing-task={t.kind} data-task-id={t.id} style={{ border: "1px solid var(--border)", borderRight: `3px solid ${closesWithStopped ? "#ef4444" : "#eab308"}`, borderRadius: "10px", padding: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "flex", gap: "8px", alignItems: "center", fontWeight: 700, fontSize: "14px" }}>
          <AlertTriangle size={15} color={closesWithStopped ? "#ef4444" : "#eab308"} /> {t.kind_label}
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-3)" }}>נפתחה {when(t.created_at)}</span>
      </div>
      <div style={{ fontSize: "13px", marginTop: "8px", lineHeight: 1.7 }}>
        <div><b>מי:</b> {t.owner_name ?? "—"} <span style={{ color: "var(--text-3)" }}>· {OWNER_LABEL[t.owner_type] ?? t.owner_type}</span></div>
        <div>
          <b>מה:</b> {t.plan_id ? anyPlanLabel(t.plan_id) : "—"} · {t.amount != null ? `${ils(t.amount)} לחודש` : "סכום לא ידוע"}
          {t.current_period_end ? <> · התקופה עד {when(t.current_period_end)}</> : null}
        </div>
        {isStop && (
          <div data-stop-instruction style={{ marginTop: "6px", color: "#fca5a5" }}>
            <b>עצרו ב-PayPlus:</b> {TASK_KIND_HINT.manual_stop_recurring}
            {t.sub_read_failed ? " (פרטי המנוי לא נקראו — לחפשו לפי שם הלקוח.)" : t.has_recurring ? "" : " למנוי אין הוראת קבע רשומה — לחפש לפי שם הלקוח והסכום."}
          </div>
        )}
        {isStop && t.owner_state && (
          <div data-stop-context style={{ marginTop: "4px", color: "var(--text-2)" }}>
            <b>{t.owner_state}</b> — המנוי נקבע לביטול בסוף התקופה, והחיוב ממשיך עד שההוראה נעצרת ב-PayPlus.
          </div>
        )}
        {isOldStop && (
          <div data-stop-instruction style={{ marginTop: "6px", color: "#fca5a5" }}>
            <b>עצרו ב-PayPlus:</b> {TASK_KIND_HINT.stop_old_recurring}
          </div>
        )}
        {!closesWithStopped && TASK_KIND_HINT[t.kind] && <div style={{ color: "var(--text-3)" }}>{TASK_KIND_HINT[t.kind]}</div>}
      </div>
      {canManage ? (
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <textarea
            aria-label="תיעוד חובה" placeholder={`תיעוד חובה (לפחות ${NOTE_MIN} תווים) — מה נעשה, ואיפה`}
            value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
            style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px", fontSize: "13px", resize: "vertical" }}
          />
          {closesWithStopped && <div data-stop-note-hint style={{ fontSize: "12px", color: "var(--text-3)" }}>{STOP_NOTE_HINT}</div>}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button data-task-action="done" onClick={() => submit("done")} disabled={!valid || busy || !onResolve}
              style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 14px", background: valid ? "#16a34a" : "transparent", color: valid ? "#fff" : "var(--text-3)", cursor: valid && !busy ? "pointer" : "not-allowed", fontWeight: 700 }}>
              {busy ? "שומר…" : closesWithStopped ? "עצרתי" : "טופל"}
            </button>
            {!closesWithStopped && (
              <button data-task-action="dismiss" onClick={() => submit("dismiss")} disabled={!valid || busy || !onResolve}
                style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 14px", background: "transparent", color: valid ? "var(--text)" : "var(--text-3)", cursor: valid && !busy ? "pointer" : "not-allowed" }}>
                סגירה בלי טיפול
              </button>
            )}
            {!valid && <span style={{ fontSize: "12px", color: "var(--text-3)" }}>הכפתור נפתח אחרי תיעוד של {NOTE_MIN} תווים</span>}
            {msg && <span data-task-msg={msg.ok ? "ok" : "error"} role="status" style={{ fontSize: "13px", color: msg.ok ? "#22c55e" : "var(--red)", display: "flex", gap: "4px", alignItems: "center" }}>
              {msg.ok && <CheckCircle2 size={14} />} {msg.text}</span>}
          </div>
        </div>
      ) : (
        <div data-task-readonly style={{ ...muted, fontSize: "12px", marginTop: "8px" }}>סגירת משימה — לסופר-אדמין בלבד.</div>
      )}
    </div>
  );
}

export function BillingRefunds({ refunds }: { refunds: BillingRefund[] | null }) {
  return (
    <div style={card} data-billing-area="refunds">
      <div style={h2}>החזרים והכחשות — 50 אחרונים</div>
      {refunds === null ? (
        <div data-billing-failed="refunds" style={{ color: "var(--red)", fontSize: "14px" }}>הקריאה נכשלה — נסו לרענן.</div>
      ) : refunds.length === 0 ? (
        <div data-billing-empty="refunds" style={muted}>עוד לא התקבלו החזרים.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "right" }}>
                <th style={th}>תאריך</th><th style={th}>לקוח</th><th style={th}>סוג</th><th style={th}>מוצר</th><th style={th}>סכום</th><th style={th}>התאמה</th><th style={th}>תוצאה</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id} data-refund-outcome={r.outcome} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>{when(r.occurred_at)}</td>
                  <td style={td}>{r.owner_name ?? "—"}<div style={{ fontSize: "11px", color: "var(--text-3)" }}>{OWNER_LABEL[r.owner_type] ?? r.owner_type}</div></td>
                  <td style={td}>{REFUND_KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td style={td}>{REFUND_PRODUCT_LABELS[r.product] ?? r.product}</td>
                  <td style={td}>{ils(r.amount)}</td>
                  <td style={td}>{REFUND_CLASS_LABELS[r.classification] ?? r.classification}</td>
                  <td style={{ ...td, color: r.outcome === "flagged" ? "#eab308" : "var(--text)" }}>{REFUND_OUTCOME_LABELS[r.outcome] ?? r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 6px" };
