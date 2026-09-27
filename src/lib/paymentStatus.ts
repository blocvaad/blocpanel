// src/lib/paymentStatus.ts — מצבי תשלום של דייר. מראה של bloc/src/lib/payments/paymentState.ts
// (122). הפאנל רק מציג; המעברים נאכפים ב-DB (guard_payments_write).

export const PAYMENT_STATUS: Record<string, { label: string; badge: string; debt: boolean }> = {
  pending:           { label: "ממתין לתשלום",         badge: "badge-yellow", debt: true },
  pending_approval:  { label: "דווח — ממתין לוועד",   badge: "badge-yellow", debt: true },
  external_pending:  { label: "בגבייה חיצונית",        badge: "badge-muted",  debt: false },
  paid:              { label: "שולם",                  badge: "badge-green",  debt: false },
  exempt:            { label: "פטור",                  badge: "badge-muted",  debt: false },
  cancelled:         { label: "בוטל",                  badge: "badge-muted",  debt: false },
  credited:          { label: "זוכה ביתרה",            badge: "badge-muted",  debt: false },
  refunded:          { label: "זוכה ביתרה",            badge: "badge-muted",  debt: false },
  provider_refunded: { label: "הוחזר דרך ספק הסליקה", badge: "badge-muted",  debt: false },
};

export function paymentStatusLabel(status: string | null | undefined): string {
  return PAYMENT_STATUS[status ?? "pending"]?.label ?? String(status ?? "—");
}

export function paymentStatusBadge(status: string | null | undefined): string {
  return PAYMENT_STATUS[status ?? "pending"]?.badge ?? "badge-muted";
}

/** פילטרים לטבלת התשלומים (label → status; "" = הכל). */
export const PAYMENT_FILTERS: Array<{ label: string; status: string }> = [
  { label: "הכל", status: "" },
  { label: "שולם", status: "paid" },
  { label: "ממתין", status: "pending" },
  { label: "דווח", status: "pending_approval" },
  { label: "חיצוני", status: "external_pending" },
  { label: "פטור", status: "exempt" },
  { label: "בוטל", status: "cancelled" },
  { label: "זוכה", status: "credited" },
];

/** שיטת תשלום לתצוגה. */
export const METHOD_LABEL: Record<string, string> = {
  payplus: "PayPlus", grow: "Grow", cardcom: "Cardcom", manual: "ידני (אושר ע״י הוועד)",
  external: "חברת הניהול", bit: "ביט", bank_transfer: "העברה בנקאית", cash: "מזומן", check: "צ׳ק",
};
