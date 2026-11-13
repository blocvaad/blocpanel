// src/lib/liveSubscriptionFlow.ts (BILL-1b, החלטה 319/329) — השעיה / ארכוב של בניין, או השעיית חברה, שיש להם מנוי חי.
// מקום אחד לשלושת ה-routes: ה-409, ה-503, והפתיחה של משימת העצירה. הפאנל לא כותב ל-billing_* ולא פונה ל-PayPlus:
// הפתיחה היא בקשה חתומה ל-bloc (open_stop_task), שמעביר את המנוי ל-cancel_pending ופותח משימה ידנית.
import { NextResponse } from "next/server";
import { callBloc } from "./blocApi";
import { can, type PanelRole } from "./permissions";
import { liveSubscription, liveSubscriptionText, type LiveSub, type LiveSubAction, type LiveSubOwner, type StopTaskResult } from "./billing";

export type StopReason = "building_suspended" | "building_archived" | "company_suspended";

export const LIVE_READ_FAILED_TEXT = "בדיקת המנוי נכשלה, לכן הפעולה לא בוצעה. נסו שוב.";
/** BILL-1b: האישור מעביר את המנוי ל"מסתיים בסוף התקופה" (329) — פעולת חיוב, ולכן רק למי שיש לו billing.manage (סופר-אדמין). */
export const LIVE_CONFIRM_FORBIDDEN_TEXT = "יש כאן מנוי חי ל-bloc. אישור השעיה או ארכוב של לקוח משלם — רק למי שמנהל חיובים (סופר-אדמין).";

/** הבדיקה לפני כל כתיבה. response = לעצור; live = יש מנוי חי והאישור ניתן (לפתוח משימה אחרי הפעולה).
 *  האישור עצמו — רק עם billing.manage (תפקיד חסר = אין הרשאה; נכשל סגור). */
export async function checkLiveSubscription(
  db: { from: (t: string) => any }, owner: LiveSubOwner, action: LiveSubAction, confirmed: boolean, role: PanelRole | null | undefined,
): Promise<{ response: NextResponse } | { live: boolean }> {
  const r = await liveSubscription(db, owner);
  if ("error" in r) {
    console.error("[live subscription read]", r.error);
    return { response: NextResponse.json({ error: LIVE_READ_FAILED_TEXT, code: "LIVE_READ_FAILED" }, { status: 503 }) };
  }
  if (!r.live) return { live: false };
  if (!confirmed) return { response: liveSubscriptionConflict(r.sub, owner.type, action) };
  if (!can(role ?? null, "billing.manage")) {
    return { response: NextResponse.json({ error: LIVE_CONFIRM_FORBIDDEN_TEXT, code: "LIVE_SUBSCRIPTION_FORBIDDEN" }, { status: 403 }) };
  }
  return { live: true };
}

/** 409 LIVE_SUBSCRIPTION — הצורה של API §7. */
export function liveSubscriptionConflict(sub: LiveSub, ownerType: LiveSubOwner["type"], action: LiveSubAction): NextResponse {
  return NextResponse.json({
    error: liveSubscriptionText(ownerType, action),
    code: "LIVE_SUBSCRIPTION",
    subscription: { status: sub.status, plan_id: sub.plan_id, has_recurring: sub.has_recurring, period_end: sub.period_end },
    action,
  }, { status: 409 });
}

/** פתיחת משימת העצירה ב-bloc, אחרי שהפעולה בוצעה. לעולם לא זורק: כשל = 'failed'. */
export async function openStopTask(owner: LiveSubOwner, reason: StopReason, actorEmail: string): Promise<StopTaskResult> {
  try {
    const r = await callBloc("/api/internal/billing", {
      action: "open_stop_task", owner_type: owner.type, owner_id: owner.id, reason, actor: actorEmail,
    });
    if (!r.ok) return "failed";
    const res = r.data.result;
    return res === "opened" || res === "already" || res === "none" ? res : "failed";
  } catch (e) {
    console.error("[open_stop_task]", e);
    return "failed";
  }
}
