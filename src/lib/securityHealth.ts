// src/lib/securityHealth.ts — תרגום בדיקות panel_security_health (125) ותצורת השרת של
// bloc (/api/internal/health, 143) למסך.
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

  // ── תצורת השרת של bloc (משתני סביבה ב-Vercel של bloc) — /api/internal/health ──
  bloc_reachable:              { title: "חיבור לשרת bloc", fix: "BLOC_APP_URL + PANEL_ACTION_SECRET ב-Vercel של הפאנל (אותו סוד כמו ב-bloc); כלל Skip ב-Cloudflare ל-/api/internal/." },
  bloc_payplus_configured:     { title: "סליקת המנוי (PayPlus) מוגדרת", fix: "PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY, PAYPLUS_PAYMENT_PAGE_UID ב-Vercel של bloc." },
  bloc_payplus_live:           { title: "סליקת המנוי במצב אמיתי (לא sandbox)", fix: "להסיר PAYPLUS_SANDBOX=true ב-Vercel של bloc." },
  bloc_webhook_token_secret:   { title: "סוד אימות webhooks של תשלומים", fix: "WEBHOOK_TOKEN_SECRET (32+ תווים) ב-Vercel של bloc." },
  bloc_insecure_webhooks_off:  { title: "webhooks לא מאומתים כבויים", fix: "להסיר ALLOW_INSECURE_WEBHOOKS מ-Vercel של bloc." },
  bloc_credentials_encryption: { title: "הצפנת מפתחות הסליקה של הבניינים", fix: "MESHULAM_ENCRYPTION_KEY ב-Vercel של bloc (לא להחליף ערך קיים — המפתחות השמורים מוצפנים בו)." },
  bloc_cron_secret:            { title: "סוד משימות מתוזמנות (cron)", fix: "CRON_SECRET (16+ תווים) ב-Vercel של bloc." },
  bloc_admin_2fa_secret:       { title: "סוד אימות דו-שלבי של ועד", fix: "ADMIN_2FA_SECRET (32+ תווים) ב-Vercel של bloc." },
  bloc_rate_limit:             { title: "הגבלת קצב משותפת (Upstash)", fix: "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ב-Vercel של bloc." },
  bloc_push:                   { title: "התראות Push (VAPID)", fix: "NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY ב-Vercel של bloc." },
  bloc_email:                  { title: "שליחת מיילים (Resend)", fix: "RESEND_API_KEY + RESEND_FROM ב-Vercel של bloc." },
  bloc_queue:                  { title: "תור שליחה (QStash)", fix: "QSTASH_TOKEN + QSTASH_CURRENT_SIGNING_KEY + QSTASH_NEXT_SIGNING_KEY ב-Vercel של bloc." },
  bloc_whatsapp:               { title: "WhatsApp (Twilio) — אופציונלי", fix: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM — רק אם רוצים תזכורות WhatsApp.", known: true },
  bloc_ai:                     { title: "עוזר AI — אופציונלי", fix: "OPENAI_API_KEY — רק אם העוזר אמור לפעול.", known: true },
  bloc_backup:                 { title: "גיבוי יומי ל-GitHub — אופציונלי", fix: "BACKUP_GITHUB_TOKEN + BACKUP_GITHUB_REPO.", known: true },
};

/** שורות תצורה מ-bloc (/api/internal/health) — רק שורות בצורה הנכונה ועם מפתח bloc_. */
export function blocHealthRows(data: unknown): HealthRow[] {
  const checks = (data as { checks?: unknown } | null)?.checks;
  if (!Array.isArray(checks)) return [];
  return checks
    .filter((c): c is { check_key: string; ok: boolean; detail?: unknown } =>
      !!c && typeof (c as { check_key?: unknown }).check_key === "string"
      && (c as { check_key: string }).check_key.startsWith("bloc_")
      && typeof (c as { ok?: unknown }).ok === "boolean")
    .map((c) => ({ check_key: c.check_key, ok: c.ok, detail: typeof c.detail === "string" ? c.detail.slice(0, 200) : null }));
}

export function healthSummary(rows: HealthRow[]): { ok: number; failed: number; knownOpen: number } {
  let ok = 0, failed = 0, knownOpen = 0;
  for (const r of rows) {
    if (r.ok) ok++;
    else if (HEALTH_CHECKS[r.check_key]?.known) knownOpen++;
    else failed++;
  }
  return { ok, failed, knownOpen };
}
