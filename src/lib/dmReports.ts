// src/lib/dmReports.ts — MOD-1 (bloc MG-S1179, החלטות 584–587): הדיווחים על הודעות פרטיות בפאנל — הצורות, הבדיקה של מה ש-bloc
// מחזיר, הזמנים והיעדים לבדיקה (SLA), והבקשות. אין כאן קריאה למסד: הכול דרך bloc החתום (/api/internal/dm-reports), ורק admin
// וסופר-אדמין (dm_reports.read / dm_reports.manage — נבדק כאן וגם ב-bloc). כל פתיחה של דיווח או קובץ נרשמת ב-bloc לפני שהתוכן יוצא.
import { z } from "zod";
import { CONNECTION_CODES } from "@/lib/moneyActions";
import { adsOutcome } from "@/lib/adsActions";
import { slaOf, type Sla } from "@/lib/sla";

export const DM_REASONS = ["threat", "harassment", "spam", "other"] as const;
export type DmReason = typeof DM_REASONS[number];
/** אותן תוויות כמו ב-bloc (lib/dm/types DM_REPORT_LABEL). */
export const DM_REASON_LABEL: Record<DmReason, string> = {
  threat: "איום או הפחדה", harassment: "הטרדה או פגיעה", spam: "ספאם או פרסום", other: "משהו אחר",
};
export const DM_STATUSES = ["open", "reviewed", "all"] as const;
export type DmStatusFilter = typeof DM_STATUSES[number];
export type DmOrder = "oldest" | "newest";
export const DM_MEDIA_KINDS = ["image", "video", "audio"] as const;
export type DmMediaKind = typeof DM_MEDIA_KINDS[number];
export const DM_NOTE_MAX = 500;
export const DM_LIST_MAX = 100;
/**
 * סקירת MOD-1 (#1, #7): התראות ושורות יומן של דיווחים על שיחות פרטיות — רק למי שרואה דיווחים (dm_reports.read). כולן נושאות
 * entity_type 'dm_report' (הפעמון מ-bloc, וכל שורה שהפאנל רושם על דיווח). הסינון ב-PostgREST: entity_type ריק או אחר (neq לבד
 * היה מפיל גם את השורות בלי entity_type).
 */
export const DM_ENTITY = "dm_report";
export const WITHOUT_DM_ROWS = "entity_type.is.null,entity_type.neq.dm_report";
/** bloc SAFETY-1: ההתראות על דיווח על תוכן (entity_type 'content_report') — רק למי שרואה את הדיווחים (content_reports.read). */
export const WITHOUT_CONTENT_ROWS = "entity_type.is.null,entity_type.neq.content_report";
/** בלי שני הסוגים (מסנן אחד: or אחד לשאילתה). */
export const WITHOUT_REPORT_ROWS = "entity_type.is.null,and(entity_type.neq.dm_report,entity_type.neq.content_report)";

/** המסנן של שורות הדיווחים לתפקיד — null: רואה הכל. */
export function reportRowsFilter(canDm: boolean, canContent: boolean): string | null {
  if (!canDm && !canContent) return WITHOUT_REPORT_ROWS;
  if (!canDm) return WITHOUT_DM_ROWS;
  if (!canContent) return WITHOUT_CONTENT_ROWS;
  return null;
}

export type DmPerson = { id: string; name: string };
export type DmReportItem = {
  id: string; status: "open" | "reviewed"; reason: DmReason; created_at: string; reviewed_at: string | null;
  building: { id: string; name: string } | null; reporter: DmPerson | null; reported: DmPerson | null;
  counts: { messages: number; verified: number; media: number }; has_note: boolean;
};
export type DmMedia = { id: string; kind: DmMediaKind; mime: string; size: number };
export type DmMessage = { id: string; at: string; from: "reporter" | "reported"; verified: boolean; text: string | null; media: DmMedia[] };
export type DmHistory = { action: "viewed" | "media" | "reviewed" | "reopened"; at: string; by: string; note: string | null; redacted: boolean; notified: boolean | null };
export type DmReport = DmReportItem & {
  note: string | null; messages: DmMessage[];
  others: { about_reported: number | null; by_reporter: number | null };
  history: DmHistory[] | null;
};
export type DmFilter = { status: DmStatusFilter; reason: DmReason | null; building: string | null; person: string | null; order: DmOrder };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isReason = (v: unknown): v is DmReason => typeof v === "string" && (DM_REASONS as readonly string[]).includes(v);
const isKind = (v: unknown): v is DmMediaKind => typeof v === "string" && (DM_MEDIA_KINDS as readonly string[]).includes(v);

/** אותה רשימה כמו ב-bloc (lib/dm/media DM_SAFE_MIME): רק סוגים שהדפדפן מציג כמדיה. SVG / HTML — לעולם לא (קוד בדף של הפאנל). */
export const DM_SAFE_MIME: Readonly<Record<DmMediaKind, readonly string[]>> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"],
  audio: ["audio/mp4", "audio/webm", "audio/ogg", "audio/mpeg", "audio/aac", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/3gpp"],
};
export function safeMime(kind: DmMediaKind, mime: string | null | undefined): string | null {
  const base = String(mime ?? "").toLowerCase().split(";")[0].trim();
  return (DM_SAFE_MIME[kind] ?? []).includes(base) ? base : null;
}

// ── מה ש-bloc מחזיר → רק הצורה הנכונה ─────────────────────────────────────────
const person = (v: unknown): DmPerson | null => {
  const o = obj(v);
  return o && isUuid(o.id) ? { id: o.id, name: (str(o.name) ?? "").trim().slice(0, 120) || "בלי שם" } : null;
};
function item(v: unknown): DmReportItem | null {
  const o = obj(v);
  if (!o || !isUuid(o.id)) return null;
  const b = obj(o.building), c = obj(o.counts) ?? {};
  return {
    id: o.id, status: o.status === "reviewed" ? "reviewed" : "open", reason: isReason(o.reason) ? o.reason : "other",
    created_at: str(o.created_at) ?? "", reviewed_at: o.status === "reviewed" ? str(o.reviewed_at) : null,
    building: b && isUuid(b.id) ? { id: b.id, name: (str(b.name) ?? "").trim().slice(0, 120) || "בניין בלי שם" } : null,
    reporter: person(o.reporter), reported: person(o.reported),
    counts: { messages: num(c.messages), verified: num(c.verified), media: num(c.media) }, has_note: o.has_note === true,
  };
}

/** תשובת list. null — הצורה לא מוכרת (גרסה אחרת של bloc): "נכשל", לא "אין דיווחים". */
export function parseDmList(data: unknown): { items: DmReportItem[]; openTotal: number | null; truncated: boolean } | null {
  const o = obj(data);
  if (!o || o.ok !== true || !Array.isArray(o.items)) return null;
  const items = o.items.map(item).filter((x): x is DmReportItem => x !== null);
  return { items, openTotal: typeof o.open_total === "number" && Number.isFinite(o.open_total) ? o.open_total : null, truncated: o.truncated === true };
}

const HISTORY = new Set(["viewed", "media", "reviewed", "reopened"]);
/** תשובת one. */
export function parseDmReport(data: unknown): DmReport | null {
  const o = obj(data);
  const r = o && o.ok === true ? obj(o.report) : null;
  const base = r ? item(r) : null;
  if (!r || !base || !Array.isArray(r.messages)) return null;
  const messages: DmMessage[] = [];
  for (const m of r.messages.slice(0, 30)) {
    const x = obj(m);
    if (!x || !isUuid(x.id)) continue;
    const verified = x.verified === true;
    const media: DmMedia[] = [];
    if (verified && Array.isArray(x.media)) {
      for (const f of x.media.slice(0, 10)) {
        const y = obj(f);
        if (!y || !isUuid(y.id) || !isKind(y.kind)) continue;
        const mime = safeMime(y.kind, str(y.mime));
        if (mime) media.push({ id: y.id, kind: y.kind, mime, size: num(y.size) });
      }
    }
    messages.push({ id: x.id, at: str(x.at) ?? "", from: x.from === "reporter" ? "reporter" : "reported", verified, text: verified ? (str(x.text) ?? "").slice(0, 4000) || null : null, media });
  }
  const others = obj(r.others) ?? {};
  const cnt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const history = Array.isArray(r.history)
    ? r.history.map(obj).filter((h): h is Row => !!h && HISTORY.has(String(h.action))).slice(0, 50).map((h) => ({
        action: h.action as DmHistory["action"], at: str(h.at) ?? "", by: (str(h.by) ?? "").slice(0, 200) || "צוות bloc",
        note: (str(h.note) ?? "").slice(0, DM_NOTE_MAX) || null, redacted: h.redacted === true, notified: typeof h.notified === "boolean" ? h.notified : null,
      }))
    : null;
  return { ...base, note: (str(r.note) ?? "").trim().slice(0, 1000) || null, messages, others: { about_reported: cnt(others.about_reported), by_reporter: cnt(others.by_reporter) }, history };
}

/**
 * תשובת media: כתובת חתומה (https, ואם ידוע — של ה-Supabase שלנו, בדלי dm-media), מפתח 32 בתים ו-IV 12 בתים (base64), וסוג בטוח.
 * null — לא מעבירים לדפדפן כלום.
 */
export function parseDmMedia(data: unknown, supabaseUrl?: string | null): { url: string; key: string; iv: string; mime: string; kind: DmMediaKind; size: number } | null {
  const o = obj(data);
  if (!o || o.ok !== true || !isKind(o.kind)) return null;
  const url = str(o.url), key = str(o.key), iv = str(o.iv);
  const mime = safeMime(o.kind, str(o.mime));
  if (!url || !key || !iv || !mime || !/^[A-Za-z0-9+/]{43}=$/.test(key) || !/^[A-Za-z0-9+/]{16}$/.test(iv)) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !u.pathname.startsWith("/storage/v1/object/sign/dm-media/")) return null;
  if (supabaseUrl) {
    let origin: string;
    try { origin = new URL(supabaseUrl).origin; } catch { return null; }
    if (u.origin !== origin) return null;
  }
  return { url, key, iv, mime, kind: o.kind, size: num(o.size) };
}

// ── הסינון (searchParams) ─────────────────────────────────────────────────────
/** מה שבכתובת → סינון תקין. ברירת המחדל: הפתוחים, הישנים קודם. */
export function dmFilterOf(sp: Record<string, string | string[] | undefined>): DmFilter {
  const one = (k: string) => { const v = sp[k]; return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null; };
  const status = one("status");
  const reason = one("reason");
  const building = one("building");
  const person = one("person");
  return {
    status: status === "reviewed" || status === "all" ? status : "open",
    reason: isReason(reason) ? reason : null,
    building: isUuid(building) ? building.toLowerCase() : null,
    person: isUuid(person) ? person.toLowerCase() : null,
    order: one("order") === "newest" ? "newest" : "oldest",
  };
}
/** הכתובת של התור עם שינוי בסינון (null — בלי הפרמטר; ברירות המחדל לא נכתבות). */
export function dmQueueHref(f: DmFilter, change: Partial<DmFilter> = {}): string {
  const n = { ...f, ...change };
  const q = new URLSearchParams();
  if (n.status !== "open") q.set("status", n.status);
  if (n.reason) q.set("reason", n.reason);
  if (n.building) q.set("building", n.building);
  if (n.person) q.set("person", n.person);
  if (n.order !== "oldest") q.set("order", n.order);
  const s = q.toString();
  return s ? `/dm-reports?${s}` : "/dm-reports";
}
/** הגוף של list ל-bloc. */
export function dmListBody(f: DmFilter): Record<string, unknown> {
  return {
    action: "list", status: f.status, order: f.order,
    ...(f.reason ? { reason: f.reason } : {}), ...(f.building ? { building_id: f.building } : {}), ...(f.person ? { reported_id: f.person } : {}),
  };
}

// ── זמנים ויעדים ──────────────────────────────────────────────────────────────
export { spanText, agoText, slaOf, type Sla } from "@/lib/sla";
/** "21.11.26 · 23:58" (שעון ישראל). בלי פסיק: בשורה מימין לשמאל הפסיק נדבק לצד הלא נכון של המספרים. */
export function whenText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) p[x.type] = x.value;
  return `${p.day}.${p.month}.${p.year} · ${p.hour}:${p.minute}`;
}

/**
 * היעד לבדיקה (SLA) לפי הסיבה — כמה שעות מהדיווח: איום — 12, הטרדה — 24, ספאם ומשהו אחר — 72. "בקרוב" — אחרי חצי מהזמן;
 * "באיחור" — אחרי כולו. דיווח שנבדק — בלי יעד.
 */
export const DM_SLA_HOURS: Record<DmReason, number> = { threat: 12, harassment: 24, spam: 72, other: 72 };
export const DM_SLA_TEXT = "היעד לבדיקה: איום תוך 12 שעות, הטרדה תוך יממה, ספאם ומשהו אחר תוך 3 ימים.";
export const dmSla = (r: Pick<DmReportItem, "status" | "reason" | "created_at">, now: number): Sla | null =>
  r.status === "open" ? slaOf(DM_SLA_HOURS[r.reason], r.created_at, now) : null;

/** "3 הודעות · 2 אומתו · קובץ אחד" — בלי שום תוכן. */
export function countsText(c: DmReportItem["counts"]): string {
  if (c.messages === 0) return "בלי הודעות מצורפות";
  const m = c.messages === 1 ? "הודעה אחת" : `${c.messages} הודעות`;
  const v = c.messages === 1 ? (c.verified ? "אומתה" : "לא אומתה") : c.verified >= c.messages ? "כולן אומתו" : c.verified === 0 ? "אף אחת לא אומתה" : c.verified === 1 ? "אחת אומתה" : `${c.verified} אומתו`;
  const f = c.media === 0 ? "" : c.media === 1 ? " · קובץ אחד" : ` · ${c.media} קבצים`;
  return `${m} · ${v}${f}`;
}
export function sizeText(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
/** האותיות לעיגול (שתי מילים ראשונות). */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "?";
}
export const MEDIA_LABEL: Record<DmMediaKind, string> = { image: "תמונה", video: "סרטון", audio: "הקלטה" };

// ── ההיסטוריה ─────────────────────────────────────────────────────────────────
/** צפיות רצופות של אותו איש צוות — שורה אחת עם מספר (האחרונות קודם, כמו שמגיע). */
export function collapseHistory(h: readonly DmHistory[]): Array<DmHistory & { times: number }> {
  const out: Array<DmHistory & { times: number }> = [];
  for (const x of h) {
    const last = out[out.length - 1];
    if (last && x.action === "viewed" && last.action === "viewed" && last.by === x.by) { last.times++; continue; }
    out.push({ ...x, times: 1 });
  }
  return out;
}
/** מה נעשה, בלי מי (המסך שם את המייל לפני, מבודד בכיוון: מייל באנגלית בתחילת שורה לא הופך אותה לשמאל-לימין). */
export function historyAction(h: DmHistory & { times?: number }): string {
  if (h.action === "viewed") return `פתח/ה את הדיווח${h.times === 2 ? " (פעמיים)" : h.times && h.times > 2 ? ` (${h.times} פעמים)` : ""}`;
  if (h.action === "media") return "פתח/ה קובץ מהדיווח";
  if (h.action === "reopened") return "החזיר/ה את הדיווח לתור";
  const told = h.notified === true ? " · עם הודעה למדווח/ת" : h.notified === false ? " · בלי הודעה למדווח/ת" : "";
  return `סימן/ה שנבדק${told}`;
}
export const historyText = (h: DmHistory & { times?: number }): string => `${h.by} ${historyAction(h)}`;

// ── הפעולות ───────────────────────────────────────────────────────────────────
const Uuid = z.string().regex(UUID, "מזהה לא תקין");
export const dmActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), id: Uuid, note: z.string().trim().max(DM_NOTE_MAX, `הערה: עד ${DM_NOTE_MAX} תווים`).optional(), notify: z.boolean() }).strict(),
  z.object({ action: z.literal("reopen"), id: Uuid }).strict(),
]);
export type DmAction = z.infer<typeof dmActionSchema>;
export const dmMediaSchema = z.object({ id: Uuid, media_id: Uuid }).strict();
export const DM_ACTION_AUDIT: Record<DmAction["action"], string> = { review: "DM_REPORT_REVIEW", reopen: "DM_REPORT_REOPEN" };

/** הצלחה רק עם ok === true ו-changed בוליאני (ב"נבדק" — גם notified). already — ההודעה כבר נשלחה בבדיקה קודמת. אחרת null = לא ברור. */
export function dmActionAnswer(action: DmAction["action"], data: unknown): { changed: boolean; notified: boolean | null; already: boolean } | null {
  const o = obj(data);
  if (!o || o.ok !== true || typeof o.changed !== "boolean") return null;
  if (action === "review" && typeof o.notified !== "boolean") return null;
  return { changed: o.changed, notified: action === "review" ? (o.notified as boolean) : null, already: o.already === true };
}

/**
 * כשל מ-bloc → מה שהצוות רואה. read — קריאה (התור, דיווח); media — קובץ; action — "נבדק" / "פתיחה מחדש" (רק בה יש "ייתכן
 * שבוצע"). בעיות חיבור (כתובת, סוד, Cloudflare) — האבחנה של callBloc כמו שהיא.
 */
export function dmFailure(r: { status: number; error: string; code?: string }, kind: "read" | "media" | "action"): { status: number; code: string; error: string } {
  const code = r.code ?? "";
  if (code && CONNECTION_CODES.has(code) && code !== "TIMEOUT" && code !== "NETWORK") return { status: r.status, code, error: r.error };
  if (kind === "action" && adsOutcome(r) === "unknown") return { status: r.status >= 400 ? r.status : 502, code: code || "unknown", error: "לא ברור אם הפעולה בוצעה. רעננו את הדף." };
  if (r.status === 403) return { status: 403, code: code || "forbidden", error: "אין הרשאה לדיווחים על הודעות פרטיות." };
  if (r.status === 404 && kind === "media") return { status: 404, code: code || "not_found", error: "הקובץ הזה לא נמצא בדיווח." };
  if (r.status === 404) return { status: 404, code: code || "not_found", error: "הדיווח כבר לא קיים (דיווחים נשמרים 12 חודשים). חזרו לרשימה." };
  if (r.status === 409 && code === "mismatch") return { status: 409, code, error: "הקובץ לא שייך להודעה שבדיווח, ולכן הוא לא נפתח." };
  if (r.status === 410) return { status: 410, code: code || "gone", error: "הקובץ כבר לא שמור: הוא נמחק מהשיחה, או שעבר זמן השמירה." };
  if (r.status === 400) return { status: 400, code: code || "invalid", error: "הבקשה לא תקינה. רעננו ונסו שוב." };
  if (code === "sql_missing") return { status: 503, code, error: "ההודעות הפרטיות עוד לא הותקנו ב-bloc (SQL 237)." };
  if (code === "write_failed") {
    return { status: 503, code, error: kind === "action" ? "לא נשמר: היומן לא נכתב, ולכן הדיווח נשאר כמו שהיה. נסו שוב בעוד רגע." : "הפתיחה לא נרשמה ביומן, ולכן התוכן לא מוצג. נסו שוב בעוד רגע." };
  }
  if (code === "read_failed") return { status: 503, code, error: "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע." };
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: kind === "action" ? "הפעולה לא הצליחה. נסו שוב." : "הקריאה מ-bloc נכשלה. נסו שוב." };
}

export const DM_PRIVACY_TEXT = "רק מה שהמדווח/ת בחר/ה לשלוח. כל פתיחה של דיווח או של קובץ נרשמת ביומן עם השם שלך. הצד השני לא יודע שדווח עליו.";
export const DM_EMPTY_TEXT = "אין דיווחים פתוחים.";
export const DM_EMPTY_FILTERED_TEXT = "אין דיווחים שמתאימים לסינון.";
export const DM_FAILED_TEXT = "טעינת הדיווחים נכשלה, וזה לא אומר שאין דיווחים. נסו שוב.";
export const DM_SQL_MISSING_TEXT = "ההודעות הפרטיות עוד לא הותקנו ב-bloc (SQL 237). אחרי ההתקנה רעננו.";
export const DM_UNVERIFIED_TEXT = "ההודעה לא אומתה מול המוצפן, ולכן הטקסט שלה לא נשמר.";
