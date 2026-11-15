// src/lib/blocAudit.ts — PANEL-PAY א1 (bloc החלטה 366): פעולה אחת — שורה אחת ביומן של bloc שהפאנל מציג.
//
// bloc רושם פעולת כסף שלקוח יכול לראות (מסלול לבניין / לחברה, קרדיטים ל-AI) בשתי שורות audit_logs עם אותו details.ref:
//   הגלויה  — building_id (או details.company_id), בלי איש הצוות ובלי ההערה;
//   הפנימית — building_id null, details.panel_actor / panel_note, והיעד ב-target_building_id / target_company_id.
// הפאנל מציג את הפעולה פעם אחת — את הפנימית (יש בה מי ולמה), והתאומה הגלויה יורדת. שורה בלי ref — כמו שהיא; ref בלי
// שורה פנימית (אחת הכתיבות נכשלה, או שהגבול של limit חתך את הזוג) — כמו שהיא. הסדר נשמר. טהור — בלי I/O.

type WithDetails = { details?: Record<string, unknown> | null };

/** ה-ref של השורה (מחרוזת לא ריקה), או null. */
export function auditRef(row: WithDetails): string | null {
  const v = row.details?.ref;
  return typeof v === "string" && v.trim() ? v : null;
}

/** השורה הפנימית של הזוג: יש בה איש הצוות (panel_actor) או יעד פנימי (target_building_id / target_company_id). */
export function isInternalAuditRow(row: WithDetails): boolean {
  const d = row.details ?? {};
  return (typeof d.panel_actor === "object" && d.panel_actor !== null)
    || typeof d.target_building_id === "string" || typeof d.target_company_id === "string";
}

/** שורה אחת לכל פעולה: בזוג עם אותו ref נשארת השורה הפנימית (הראשונה), והשאר יורדות. אותם אובייקטים, באותו סדר. */
export function oneEntryPerAction<T extends WithDetails>(rows: readonly T[]): T[] {
  const internal = new Map<string, T>();
  for (const r of rows) {
    const ref = auditRef(r);
    if (ref && !internal.has(ref) && isInternalAuditRow(r)) internal.set(ref, r);
  }
  return rows.filter((r) => {
    const ref = auditRef(r);
    if (!ref) return true;
    const kept = internal.get(ref);
    return kept === undefined || kept === r;
  });
}
