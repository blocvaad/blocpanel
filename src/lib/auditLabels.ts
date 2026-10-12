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
};
