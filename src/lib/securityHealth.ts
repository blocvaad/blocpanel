// src/lib/securityHealth.ts — תרגום בדיקות panel_security_health (125) למסך.
export type HealthRow = { check_key: string; ok: boolean; detail: string | null };

export const HEALTH_CHECKS: Record<string, { title: string; fix: string; known?: boolean }> = {
  secrets_table_locked:     { title: "מפתחות הסליקה נעולים", fix: "להריץ 124 (building_payment_secrets בלי הרשאות ל-anon/authenticated)." },
  no_plaintext_credentials: { title: "אין מפתחות גלויים בטבלת buildings", fix: "להריץ שוב את 124 — מעתיק ומרוקן." },
  door_codes_protected:     { title: "קודי דלת מוגנים", fix: "להריץ שוב את 124 (building_access_codes)." },
  panel_views_closed:       { title: "views של הפאנל סגורים לציבור", fix: "REVOKE ALL על ה-view מ-anon, authenticated (124)." },
  storage_reads_scoped:     { title: "קבצים: קריאה רק לתיקייה של המשתמש", fix: "להריץ את החלק של Storage ב-124." },
  guard_triggers:           { title: "טריגרי ההגנה קיימים", fix: "להריץ את המיגרציה שיוצרת את הטריגר החסר (119–125)." },
  rls_enabled:              { title: "RLS פעיל בכל הטבלאות", fix: "ALTER TABLE … ENABLE ROW LEVEL SECURITY לטבלאות שברשימה." },
  definer_search_path:      { title: "פונקציות SECURITY DEFINER עם search_path", fix: "ALTER FUNCTION … SET search_path = '' לפונקציות שברשימה." },
  money_rpcs_private:       { title: "פעולות כסף לא חשופות ללקוח", fix: "REVOKE EXECUTE מ-anon/authenticated לפונקציות שברשימה." },
  payments_status_not_null: { title: "לכל תשלום יש סטטוס", fix: "להריץ 122." },
  buildings_select_scoped:  { title: "פרטי בניינים לא קריאים לכל משתמש", fix: "ידוע (P2): לצמצם את buildings_select לחברים/מנהלים/ספקים מאושרים.", known: true },
};

export function healthSummary(rows: HealthRow[]): { ok: number; failed: number; knownOpen: number } {
  let ok = 0, failed = 0, knownOpen = 0;
  for (const r of rows) {
    if (r.ok) ok++;
    else if (HEALTH_CHECKS[r.check_key]?.known) knownOpen++;
    else failed++;
  }
  return { ok, failed, knownOpen };
}
