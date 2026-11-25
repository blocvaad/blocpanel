// src/lib/contentReports.ts — bloc SAFETY-1 (MG-S1241, החלטות 676–677): הדיווחים של דיירים על תוכן מהצ'אט של הבניין, מהלוח ומהשוק —
// הצורות, הבדיקה של מה ש-bloc מחזיר, הסינון, הבקשות והמילים. אין כאן קריאה למסד: הכול דרך bloc החתום (/api/internal/content-reports),
// ורק admin וסופר-אדמין (content_reports.read / content_reports.manage — נבדק כאן וגם ב-bloc). פתיחה של פריט נרשמת ב-bloc לפני שהתוכן
// יוצא, וביומן של הפאנל. מי דיווח — לא מגיע לפאנל לעולם (bloc לא קורא אותו לתור ולפריט).
import { z } from "zod";
import { CONNECTION_CODES } from "@/lib/moneyActions";
import { adsOutcome } from "@/lib/adsActions";

export const CR_SOURCES = ["chat", "post", "response", "market", "market_comment"] as const;
export type CrSource = typeof CR_SOURCES[number];
/** אותן מילים כמו ב-bloc (lib/safety/view SOURCE_LABEL). */
export const CR_SOURCE_LABEL: Record<CrSource, string> = {
  chat: "הודעה בצ'אט הבניין", post: "בקשה בלוח", response: "תגובה בלוח", market: "מודעה בשוק", market_comment: "הודעה על מודעה",
};
export const CR_REASONS = ["offensive", "harassment", "threat", "spam", "private", "other"] as const;
export type CrReason = typeof CR_REASONS[number];
/** אותן מילים כמו ב-bloc (lib/safety/view REPORT_REASONS). */
export const CR_REASON_LABEL: Record<CrReason, string> = {
  offensive: "פוגעני או גס", harassment: "הטרדה או בריונות", threat: "איום או אלימות", spam: "ספאם או פרסומת", private: "חושף פרטים אישיים", other: "משהו אחר",
};
export type CrStatus = "open" | "hidden" | "dismissed" | "referred";
export const CR_STATUS_LABEL: Record<CrStatus, string> = { open: "פתוח", hidden: "הוסתר", dismissed: "נבדק, נשאר", referred: "הועבר לוועד" };
export type CrStatusFilter = "open" | "closed" | "all";
export type CrOrder = "newest" | "oldest";
export const CR_NOTE_MAX = 300;

export type CrItem = {
  source: CrSource; source_id: string;
  building: { id: string; name: string };
  author: { id: string; name: string } | null;
  /** כמה דיווחים פתוחים יש על מי שכתב (על כל הפריטים שלו); null — לא נספר. */
  author_open: number | null;
  reports: number; open: number;
  reasons: Partial<Record<CrReason, number>>;
  notes: number;
  first_at: string; last_at: string;
  status: CrStatus;
  hidden: "auto" | "staff" | null;
};
export type CrReport = {
  item: CrItem;
  reports: Array<{ reason: CrReason; note: string | null; at: string; status: CrStatus }>;
  snapshots: string[];
  current: { text: string; has_image: boolean; link: string | null } | null;
};
export type CrFilter = { status: CrStatusFilter; source: CrSource | null; order: CrOrder };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isCrSource = (v: unknown): v is CrSource => typeof v === "string" && (CR_SOURCES as readonly string[]).includes(v);
const isReason = (v: unknown): v is CrReason => typeof v === "string" && (CR_REASONS as readonly string[]).includes(v);
const STATUSES = new Set(["open", "hidden", "dismissed", "referred"]);
const status = (v: unknown): CrStatus => (STATUSES.has(String(v)) ? (v as CrStatus) : "open");

// ── מה ש-bloc מחזיר → רק הצורה הנכונה ─────────────────────────────────────────
function item(v: unknown): CrItem | null {
  const o = obj(v);
  if (!o || !isCrSource(o.source) || !isUuid(o.source_id)) return null;
  const b = obj(o.building), a = obj(o.author), r = obj(o.reasons) ?? {};
  if (!b || !isUuid(b.id)) return null;
  const reasons: Partial<Record<CrReason, number>> = {};
  for (const k of CR_REASONS) if (num(r[k]) > 0) reasons[k] = num(r[k]);
  return {
    source: o.source, source_id: o.source_id.toLowerCase(),
    building: { id: b.id, name: (str(b.name) ?? "").trim().slice(0, 120) || "בניין בלי שם" },
    author: a && isUuid(a.id) ? { id: a.id, name: (str(a.name) ?? "").trim().slice(0, 120) || "בלי שם" } : null,
    author_open: typeof o.author_open === "number" && Number.isFinite(o.author_open) && o.author_open >= 0 ? Math.floor(o.author_open) : null,
    reports: num(o.reports), open: num(o.open), reasons, notes: num(o.notes),
    first_at: str(o.first_at) ?? "", last_at: str(o.last_at) ?? "",
    status: status(o.status), hidden: o.hidden === "auto" || o.hidden === "staff" ? o.hidden : null,
  };
}

/** תשובת list. null — הצורה לא מוכרת (גרסה אחרת של bloc): "נכשל", לא "אין דיווחים". */
export function parseCrList(data: unknown): { items: CrItem[]; openTotal: number | null; truncated: boolean } | null {
  const o = obj(data);
  if (!o || o.ok !== true || !Array.isArray(o.items)) return null;
  const items = o.items.map(item).filter((x): x is CrItem => x !== null);
  return { items, openTotal: typeof o.open_total === "number" && Number.isFinite(o.open_total) ? o.open_total : null, truncated: o.truncated === true };
}

/** תשובת one. התוכן נחתך (עותק עד 1,200 תווים, כמו ב-bloc), קישור — רק נתיב פנימי של bloc. */
export function parseCrReport(data: unknown): CrReport | null {
  const o = obj(data);
  const r = o && o.ok === true ? obj(o.report) : null;
  const base = r ? item(r.item) : null;
  if (!r || !base || !Array.isArray(r.reports) || !Array.isArray(r.snapshots)) return null;
  const cur = obj(r.current);
  const link = cur ? str(cur.link) : null;
  return {
    item: base,
    reports: r.reports.map(obj).filter((x): x is Row => !!x).slice(0, 200).map((x) => ({
      reason: isReason(x.reason) ? x.reason : "other", note: (str(x.note) ?? "").trim().slice(0, 500) || null, at: str(x.at) ?? "", status: status(x.status),
    })),
    snapshots: r.snapshots.map(str).filter((x): x is string => !!x).slice(0, 5).map((x) => x.slice(0, 1200)),
    current: cur ? {
      text: (str(cur.text) ?? "").slice(0, 4000), has_image: cur.has_image === true,
      link: link && /^\/[a-z]/.test(link) && !link.startsWith("//") ? link.slice(0, 200) : null,
    } : null,
  };
}

// ── הסינון ─────────────────────────────────────────────────────────────────────
export function crFilterOf(sp: Record<string, string | string[] | undefined>): CrFilter {
  const one = (k: string) => { const v = sp[k]; return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null; };
  const s = one("status"), src = one("source");
  return {
    status: s === "closed" || s === "all" ? s : "open",
    source: isCrSource(src) ? src : null,
    order: one("order") === "oldest" ? "oldest" : "newest",
  };
}
export function crListBody(f: CrFilter): Record<string, unknown> {
  return { action: "list", status: f.status, order: f.order, ...(f.source ? { source: f.source } : {}) };
}
export function crApiUrl(f: CrFilter): string {
  const q = new URLSearchParams({ status: f.status, order: f.order });
  if (f.source) q.set("source", f.source);
  return `/api/content-reports?${q.toString()}`;
}

// ── המילים ─────────────────────────────────────────────────────────────────────
/** "3 דיווחים · 2 פוגעני או גס · 1 הטרדה" */
export function reasonsText(i: Pick<CrItem, "reports" | "reasons">): string {
  const head = i.reports === 1 ? "דיווח אחד" : `${i.reports} דיווחים`;
  const parts = CR_REASONS.filter((k) => i.reasons[k]).map((k) => `${i.reasons[k]} ${CR_REASON_LABEL[k]}`);
  return [head, ...parts].join(" · ");
}
export function hiddenText(h: CrItem["hidden"]): string | null {
  return h === "auto" ? "מוסתר אוטומטית (3 דיווחים)" : h === "staff" ? "מוסתר בידי צוות bloc" : null;
}
export function authorLine(i: Pick<CrItem, "author" | "author_open">): string {
  if (!i.author) return "מי שכתב — חשבון שנמחק";
  const more = i.author_open && i.author_open > 1 ? ` · ${i.author_open} דיווחים פתוחים על מה שכתב/ה` : "";
  return `${i.author.name}${more}`;
}
export const CR_PRIVACY_TEXT = "מי דיווח לא מוצג כאן, ולא נמסר לאף אחד. כל פתיחה של פריט נרשמת ביומן עם השם שלך.";
export const CR_EMPTY_TEXT = "אין דיווחים פתוחים.";
export const CR_EMPTY_FILTERED_TEXT = "אין דיווחים שמתאימים לסינון.";
export const CR_FAILED_TEXT = "טעינת הדיווחים נכשלה, וזה לא אומר שאין דיווחים. נסו שוב.";
export const CR_SQL_MISSING_TEXT = "הדיווחים על תוכן עוד לא הותקנו ב-bloc (SQL 255). אחרי ההתקנה רעננו.";

// ── הפעולות ───────────────────────────────────────────────────────────────────
const Uuid = z.string().regex(UUID, "מזהה לא תקין");
const Source = z.enum(CR_SOURCES);
export const crOneSchema = z.object({ source: Source, id: Uuid }).strict();
export const crActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hide"), source: Source, id: Uuid, note: z.string().trim().max(CR_NOTE_MAX, `סיבה: עד ${CR_NOTE_MAX} תווים`).optional() }).strict(),
  z.object({ action: z.literal("restore"), source: Source, id: Uuid, note: z.string().trim().max(CR_NOTE_MAX, `הערה: עד ${CR_NOTE_MAX} תווים`).optional() }).strict(),
  z.object({ action: z.literal("refer"), source: Source, id: Uuid, note: z.string().trim().max(CR_NOTE_MAX, `הערה: עד ${CR_NOTE_MAX} תווים`).optional() }).strict(),
]);
export type CrAction = z.infer<typeof crActionSchema>;
export const CR_ACTION_AUDIT: Record<CrAction["action"], string> = { hide: "CONTENT_REPORT_HIDE", restore: "CONTENT_REPORT_RESTORE", refer: "CONTENT_REPORT_REFER" };
/** מה שקרה באמת (סקירת SAFETY-1 #6): מה השתנה, כמה דיווחים נסגרו ומי קיבל הודעה — לא משפט קבוע. */
export function crDoneText(action: CrAction["action"], a: { changed: boolean; closed: number; notified: boolean }): string {
  if (action === "hide") return !a.changed ? "הפריט כבר היה מוסתר — לא השתנה דבר." : a.notified ? "הפריט מוסתר לכולם, ומי שכתב קיבל הודעה." : "הפריט מוסתר לכולם.";
  if (action === "restore") {
    if (!a.changed) return "לא היה מה לשנות.";
    return a.notified ? "הפריט מוצג שוב, ומי שכתב קיבל הודעה." : a.closed > 0 ? "הדיווחים נסגרו, והפריט נשאר מוצג." : "הפריט מוצג.";
  }
  return a.closed > 0 ? "נשלח לוועד של הבניין, והדיווחים נסגרו." : "נשלח לוועד של הבניין. הדיווחים עוד פתוחים — רעננו.";
}

/** הצלחה רק עם ok === true ו-changed בוליאני. אחרת null = לא ברור. */
export function crActionAnswer(data: unknown): { changed: boolean; closed: number; notified: boolean } | null {
  const o = obj(data);
  if (!o || o.ok !== true || typeof o.changed !== "boolean") return null;
  return { changed: o.changed, closed: num(o.closed), notified: o.notified === true };
}

/** כשל מ-bloc → מה שהצוות רואה. בעיות חיבור (כתובת, סוד, Cloudflare) — האבחנה של callBloc כמו שהיא. */
export function crFailure(r: { status: number; error: string; code?: string }, kind: "read" | "action"): { status: number; code: string; error: string } {
  const code = r.code ?? "";
  if (code && CONNECTION_CODES.has(code) && code !== "TIMEOUT" && code !== "NETWORK") return { status: r.status, code, error: r.error };
  if (kind === "action" && adsOutcome(r) === "unknown") return { status: r.status >= 400 ? r.status : 502, code: code || "unknown", error: "לא ברור אם הפעולה בוצעה. רעננו את הדף." };
  if (r.status === 403) return { status: 403, code: code || "forbidden", error: "אין הרשאה לדיווחים על תוכן." };
  if (r.status === 404) return { status: 404, code: code || "not_found", error: "אין דיווחים על הפריט הזה (דיווחים נשמרים 12 חודשים). רעננו את הרשימה." };
  if (r.status === 409 && code === "private") return { status: 409, code, error: "הודעה על מודעה היא שיחה של שניים — לא מעבירים אותה לוועד. אפשר להסתיר או להשאיר." };
  if (r.status === 409 && code === "hidden") return { status: 409, code, error: "הפריט מוסתר, והוועד לא רואה אותו — לא מעבירים. אפשר להשאיר מוסתר או להחזיר, ואז להעביר." };
  if (r.status === 409 && code === "no_committee") return { status: 409, code, error: "לבניין אין ועד פעיל — אין למי להעביר. אפשר להסתיר או להשאיר." };
  if (r.status === 400) return { status: 400, code: code || "invalid", error: "הבקשה לא תקינה. רעננו ונסו שוב." };
  if (code === "sql_missing") return { status: 503, code, error: CR_SQL_MISSING_TEXT };
  if (code === "write_failed") {
    return { status: 503, code, error: kind === "action" ? "לא נשמר. נסו שוב בעוד רגע." : "הפתיחה לא נרשמה ביומן, ולכן התוכן לא מוצג. נסו שוב בעוד רגע." };
  }
  if (code === "read_failed") return { status: 503, code, error: "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע." };
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: kind === "action" ? "הפעולה לא הצליחה. נסו שוב." : "הקריאה מ-bloc נכשלה. נסו שוב." };
}
