// src/lib/ops.ts — bloc OPS-1 (שלב 9, החלטות 752–755): מרכז התפעול של הפאנל — הטיפוסים, הסכמות והתוויות.
//
// מצב התפעול מגיע מ-bloc (api/internal/ops — bloc lib/ops/opsStatus; אותם שמות שדות): המשימות המתוזמנות, הגיבוי ותרגול
// השחזור, התורים של הצוות, התצורה והתקלות הפתוחות. יומן התקלות ותרגולי השחזור — טבלאות של הפאנל (bloc 261), דרך bloc.
import { z } from "zod";
import type { Severity } from "./playbooks";

export type OpsLevel = "ok" | "warn" | "down" | "unknown";

export type OpsItem = {
  key: string; area: "jobs" | "backup" | "queues" | "config" | "incidents"; level: OpsLevel; title: string; detail: string;
  at: string | null; count: number | null; playbook: string | null; href: string | null;
};
export type OpsJob = {
  job: string; label: string; schedule: string; critical: boolean; level: OpsLevel; last_success: string | null;
  last_failure: string | null; last_error: string | null; week: { ok: number; failed: number } | null; last_duration_ms: number | null;
};
export type OpsDrill = { done_at: string; result: string; backup_date: string; method: string; mismatches: number | null };
export type OpsSnapshot = {
  generated_at: string;
  overall: OpsLevel;
  counts: Record<OpsLevel, number>;
  items: OpsItem[];
  jobs: OpsJob[];
  backup: {
    level: OpsLevel; configured: boolean; last_success: string | null; tables: number | null; rows: number | null; bytes: number | null;
    failed_tables: string[]; week: { ok: number; failed: number } | null; drill: OpsDrill | null;
  };
  queues: Array<{ key: string; title: string; count: number | null; oldest: string | null; level: OpsLevel; href: string }>;
  failed: string[];
};

export type Incident = {
  id: string; title: string; severity: Severity; status: "open" | "monitoring" | "resolved"; playbook: string | null; source: string | null;
  summary: string | null; opened_by_email: string; opened_at: string; updated_at: string; resolved_at: string | null; resolved_by_email: string | null;
};
export type IncidentUpdate = { id: number; incident_id: string; at: string; by_email: string; status: string | null; note: string };
export type Drill = {
  id: string; done_at: string; done_by_email: string; backup_date: string; method: "verify" | "restore"; result: "passed" | "partial" | "failed";
  tables_checked: number | null; rows_checked: number | null; mismatches: number | null; notes: string | null;
};

/** מה /api/ops מחזיר: כל חלק לבד — כשל באחד ("לא נטען") לא מסתיר את האחרים. */
export type OpsResponse = {
  snapshot: OpsSnapshot | null;
  snapshotError: string | null;
  incidents: Incident[] | null;
  updates: IncidentUpdate[];
  drills: Drill[] | null;
  canManage: boolean;
};

export const LEVEL_LABEL: Record<OpsLevel, string> = { ok: "תקין", warn: "לבדוק", down: "לא תקין", unknown: "לא נטען" };
export const LEVEL_COLOR: Record<OpsLevel, string> = { ok: "var(--green)", warn: "var(--yellow)", down: "var(--red)", unknown: "var(--text-3)" };
export const STATUS_LABEL: Record<Incident["status"], string> = { open: "פתוחה", monitoring: "במעקב", resolved: "נסגרה" };
export const RESULT_LABEL: Record<Drill["result"], string> = { passed: "עבר", partial: "עבר חלקית", failed: "נכשל" };
export const METHOD_LABEL: Record<Drill["method"], string> = { verify: "בדיקה מול המניפסט (--verify)", restore: "שחזור לפרויקט זמני" };

/** "ממש עכשיו" / "לפני 5 דקות" / "לפני 3 שעות" / "לפני 2 ימים" — לפי השעון של הדפדפן. */
export function agoLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "ממש עכשיו";
  if (s < 3600) { const m = Math.floor(s / 60); return m === 1 ? "לפני דקה" : `לפני ${m} דקות`; }
  if (s < 172800) { const h = Math.floor(s / 3600); return h === 1 ? "לפני שעה" : h === 2 ? "לפני שעתיים" : `לפני ${h} שעות`; }
  const d = Math.floor(s / 86400);
  return d === 2 ? "לפני יומיים" : `לפני ${d} ימים`;
}

export function bytesLabel(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין");
const KEY = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const SOURCE = z.string().regex(/^[a-z0-9_:.-]{1,60}$/);

export const opsActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    title: z.string().trim().min(3, "כותרת קצרה מדי").max(140),
    severity: z.enum(["p0", "p1", "p2", "p3"]),
    playbook: KEY.nullable().optional(),
    source: SOURCE.nullable().optional(),
    summary: z.string().trim().max(2000).nullable().optional(),
  }).strict(),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    note: z.string().trim().min(1, "כתבו מה קרה").max(2000),
    status: z.enum(["open", "monitoring"]).optional(),
  }).strict(),
  z.object({
    action: z.literal("resolve"),
    id: z.string().uuid(),
    summary: z.string().trim().min(3, "כתבו סיכום קצר: מה קרה ומה נעשה").max(2000),
  }).strict(),
  z.object({
    action: z.literal("drill"),
    backup_date: DATE,
    method: z.enum(["verify", "restore"]),
    result: z.enum(["passed", "partial", "failed"]),
    tables_checked: z.number().int().min(0).max(100000).nullable().optional(),
    rows_checked: z.number().int().min(0).max(1e12).nullable().optional(),
    mismatches: z.number().int().min(0).max(100000).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }).strict(),
]);
export type OpsAction = z.infer<typeof opsActionSchema>;

/** התאריך של הגיבוי לא בעתיד (שעון ישראל). */
export function drillDateOk(backupDate: string, now: Date = new Date()): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return backupDate <= today && backupDate >= "2026-01-01";
}

/** אתמול בלוח השנה של ישראל (YYYY-MM-DD) — ברירת המחדל של "רישום תרגול" (הגיבוי של הלילה). יום בלוח, לא עכשיו פחות 24 שעות. */
export function yesterdayIL(now: Date = new Date()): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}
