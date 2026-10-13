// src/lib/auditLabels.ts — שמות הפעולות ביומן הפאנל (panel_audit_logs.action), לדף היומן ולפעילות האחרונה.
// פעולה שאין לה שם כאן — מוצגת כמו שהיא (הקוד).
export const AUDIT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  BLOCK_TENANT:      { label: "חסימת דייר",     color: "#ef4444", bg: "#ef444418" },
  APPROVE_TENANT:    { label: "אישור דייר",     color: "#22c55e", bg: "#22c55e18" },
  UPDATE_TENANT:     { label: "עדכון דייר",     color: "#3b82f6", bg: "#3b82f618" },
  UPDATE_BUILDING:   { label: "עדכון בניין",    color: "#3b82f6", bg: "#3b82f618" },
  DELETE_BUILDING:   { label: "מחיקת בניין",    color: "#ef4444", bg: "#ef444418" },
  ARCHIVE_BUILDING:  { label: "העברה לארכיון",  color: "#eab308", bg: "#eab30818" },
  SUSPEND_BUILDING:  { label: "השעיית בניין",   color: "#f97316", bg: "#f9731618" },
  ACTIVATE_BUILDING: { label: "הפעלת בניין",    color: "#22c55e", bg: "#22c55e18" },
  CREATE_ADMIN:      { label: "מנהל חדש",       color: "#eab308", bg: "#eab30818" },
  // הודעות לבניינים (bloc UI-R5a)
  BROADCAST:         { label: "הודעה לבניינים", color: "#3b82f6", bg: "#3b82f618" },
  BROADCAST_END:     { label: "הורדת הודעה",    color: "#f97316", bg: "#f9731618" },
  BROADCAST_UPDATE:  { label: "עריכת הודעה",    color: "#3b82f6", bg: "#3b82f618" },
  BROADCAST_DELETE:  { label: "מחיקת הודעה",    color: "#ef4444", bg: "#ef444418" },
  // דיירים וועד (bloc UI-R5c-1) — דרך bloc
  MEMBER_APPROVE:    { label: "אישור הצטרפות",      color: "#22c55e", bg: "#22c55e18" },
  MEMBER_REJECT:     { label: "דחיית הצטרפות",      color: "#f97316", bg: "#f9731618" },
  MEMBER_REMOVE:     { label: "הסרה מבניין",        color: "#ef4444", bg: "#ef444418" },
  MEMBER_ROLE:       { label: "שינוי בוועד",         color: "#3b82f6", bg: "#3b82f618" },
  MEMBER_APARTMENT:  { label: "דירה וקומה",          color: "#3b82f6", bg: "#3b82f618" },
  MEMBER_TRANSFER:   { label: "מעבר לבניין אחר",     color: "#3b82f6", bg: "#3b82f618" },
  MEMBER_FOUNDER:    { label: "מינוי ראש ועד לבניין חדש", color: "#22c55e", bg: "#22c55e18" },
  ACCOUNT_BLOCK:     { label: "חסימת חשבון",         color: "#ef4444", bg: "#ef444418" },
  ACCOUNT_UNBLOCK:   { label: "ביטול חסימת חשבון",   color: "#22c55e", bg: "#22c55e18" },
  // קרדיטים ל-AI (bloc AI-1)
  AI_CREDITS_GRANT:  { label: "קרדיטים ל-AI במתנה", color: "#3b82f6", bg: "#3b82f618" },
  // פעולות קיימות שלא היה להן שם (מוצגות היו כקוד)
  TRANSFER_TENANT:   { label: "העברת דייר (לפני העדכון)", color: "#3b82f6", bg: "#3b82f618" },
  CREATE_BUILDING:   { label: "בניין חדש",           color: "#22c55e", bg: "#22c55e18" },
  COMMITTEE_REQUEST: { label: "בקשה להחלפת ראש ועד", color: "#eab308", bg: "#eab30818" },
  COMMITTEE_EXECUTE: { label: "ביצוע החלפת ראש ועד", color: "#f97316", bg: "#f9731618" },
  COMMITTEE_CANCEL:  { label: "ביטול בקשה להחלפת ראש ועד", color: "#a1a1aa", bg: "#a1a1aa18" },
  COMMITTEE_EXTEND:  { label: "הארכת מועד העברת ועד", color: "#3b82f6", bg: "#3b82f618" },
};
