"use client";
// src/components/ui/LiveSubscriptionDialog.tsx (BILL-1b, החלטה 319, E46) — "לבניין / לחברה יש מנוי חי".
// מוצג על 409 LIVE_SUBSCRIPTION מהשעיה / ארכוב של בניין או השעיה של חברה. "ביטול" לא שולח כלום; "אשרו והשעו" שולח
// שוב את אותה בקשה עם confirm_live_subscription:true (ההורה שולח — הרכיב רק קורא ל-onConfirm). disabled בזמן שליחה.
// הרכיב בכוונה בלי hooks (פונקציה טהורה של props): אפשר לבדוק אותו בלי דפדפן.
import { Modal, Banner, ghostBtn, solidBtn } from "./panelKit";
import { anyPlanLabel } from "@/lib/plans";
import { STATUS_LABELS, STOP_TASK_FAILED_TEXT, type LiveSub, type LiveSubAction, type StopTaskResult } from "@/lib/billing";

export type LiveSubscriptionConflict = { subscription: LiveSub; action: LiveSubAction; error: string };

/** 409 LIVE_SUBSCRIPTION של הפאנל → הנתונים לדיאלוג; כל תשובה אחרת → null. */
export function parseLiveConflict(status: number, body: unknown): LiveSubscriptionConflict | null {
  const b = body as { code?: unknown; subscription?: Partial<LiveSub>; action?: unknown; error?: unknown } | null;
  if (status !== 409 || !b || b.code !== "LIVE_SUBSCRIPTION" || !b.subscription) return null;
  const s = b.subscription;
  return {
    subscription: { status: String(s.status ?? ""), plan_id: String(s.plan_id ?? ""), has_recurring: s.has_recurring === true, period_end: typeof s.period_end === "string" ? s.period_end : null },
    action: b.action === "archive" ? "archive" : "suspend",
    error: typeof b.error === "string" ? b.error : "",
  };
}

export const DIALOG_COPY = {
  title: { building: "לבניין יש מנוי חי", company: "לחברה יש מנוי חי" },
  explain: {
    suspend: "ההשעיה לא עוצרת את החיוב. אחרי האישור תיפתח משימת עצירה ידנית ב-PayPlus.",
    archive: "הארכוב לא עוצר את החיוב. אחרי האישור תיפתח משימת עצירה ידנית ב-PayPlus.",
  },
  confirm: { suspend: "אשרו והשעו", archive: "אשרו וארכבו" },
  busy: "שולחים…",
  cancel: "ביטול",
  recurring: { yes: "יש הוראת קבע", no: "אין הוראת קבע" },
} as const;

export default function LiveSubscriptionDialog({ owner, conflict, busy = false, error, onConfirm, onCancel }: {
  owner: "building" | "company";
  conflict: LiveSubscriptionConflict;
  busy?: boolean;
  /** כשל בשליחה החוזרת (רשת / שרת). */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const sub = conflict.subscription;
  const action = conflict.action;
  return (
    <Modal title={DIALOG_COPY.title[owner]} onClose={onCancel} busy={busy} width={440}>
      <div data-live-sub-dialog={owner} data-live-sub-action={action} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <dl style={{ display: "flex", flexDirection: "column", gap: "6px", margin: 0, fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }}>
          <div data-live-sub-line="plan" style={{ display: "flex", gap: "8px" }}>
            <dt style={{ color: "var(--text-3)" }}>מסלול:</dt><dd style={{ margin: 0, fontWeight: 600 }}>{anyPlanLabel(sub.plan_id)}</dd>
          </div>
          <div data-live-sub-line="status" style={{ display: "flex", gap: "8px" }}>
            <dt style={{ color: "var(--text-3)" }}>סטטוס:</dt><dd style={{ margin: 0, fontWeight: 600 }}>{STATUS_LABELS[sub.status] ?? sub.status}</dd>
          </div>
          <div data-live-sub-line="recurring" style={{ fontWeight: 600, color: sub.has_recurring ? "#f97316" : "var(--text-2)" }}>
            {sub.has_recurring ? DIALOG_COPY.recurring.yes : DIALOG_COPY.recurring.no}
          </div>
        </dl>
        <p data-live-sub-explain="" style={{ margin: 0, fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.7 }}>{DIALOG_COPY.explain[action]}</p>
        {error && <Banner tone="error">{error}</Banner>}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button type="button" data-live-sub-cancel="" onClick={onCancel} disabled={busy} style={{ ...ghostBtn, flex: 1, minHeight: "48px" }}>{DIALOG_COPY.cancel}</button>
          <button type="button" data-live-sub-confirm="" onClick={onConfirm} disabled={busy}
            style={{ ...solidBtn("#f97316"), flex: 2, opacity: busy ? 0.5 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? DIALOG_COPY.busy : DIALOG_COPY.confirm[action]}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** stop_task:'failed' — הפעולה בוצעה והמשימה לא נפתחה. אזהרה בולטת (לא נעלמת לבד), בלי לבלבל עם הצלחה. */
export function StopTaskFailedNotice({ onClose }: { onClose?: () => void }) {
  return (
    <div data-stop-task-failed="" role="alert" style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "14px 16px", borderRadius: "12px", background: "#ef444418", border: "2px solid #ef4444", color: "var(--text)", fontSize: "14.5px", lineHeight: 1.6, fontWeight: 600 }}>
      <span style={{ flex: 1 }}>{STOP_TASK_FAILED_TEXT}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="סגירה" style={{ ...ghostBtn, minWidth: "44px" }}>סגירה</button>}
    </div>
  );
}

/** מה לומר על תוצאת משימת העצירה אחרי פעולה שהצליחה (null = כלום; failed מטופל ב-StopTaskFailedNotice). */
export function stopTaskNote(r: StopTaskResult | undefined): string | null {
  if (r === "opened") return "נפתחה משימת עצירה ידנית ב״חיוב ומנויים״.";
  if (r === "already") return "משימת העצירה כבר הייתה פתוחה.";
  return null;
}
