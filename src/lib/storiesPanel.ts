// src/lib/storiesPanel.ts — STORIES-1 (bloc, החלטות 438–442): המיתון של הסטורי בפאנל — מה עובר לדפדפן ומה נשלח ל-bloc.
//   • התור: דיווחים פתוחים, מקובצים לפי פריט (בניין + מקור + מזהה) — כמה דיווחו ולמה, מתי הראשון והאחרון. מי דיווח — אף פעם:
//     reporter_id לא נקרא בכלל (STORY_REPORT_COLUMNS), ובפריט — רק הכותרת, קטע קצר והתמונה (בלוח).
//   • הפעולות — דרך bloc החתום (internal/stories): hide / unhide / dismiss / refer / building_off / building_on — stories.manage;
//     pilot_on / pilot_off / global_on / global_off — stories.pilot (סופר-אדמין). ההרשאה נבדקת ב-route של הפאנל וגם ב-bloc.
//   • S345 (שלב 3, הסטורי לכולם): המתג הראשי (stories_public), כיבוי לבניין (גובר על הוועד), והעברה לוועד (בלי מי דיווח).
import { z } from "zod";
import { CONNECTION_CODES } from "@/lib/moneyActions";
import { adsOutcome } from "@/lib/adsActions";

export const STORY_SOURCES = ["event", "announcement", "poll", "market", "fixed"] as const;
export type StorySource = typeof STORY_SOURCES[number];
export const STORY_SOURCE_LABEL: Record<StorySource, string> = {
  event: "אירוע", announcement: "הודעה", poll: "הצבעה", market: "מודעה בלוח", fixed: "תקלה שתוקנה",
};
/** הטבלה של כל מקור — כמו ב-bloc (lib/stories/server STORY_SOURCE_TABLE). */
export const STORY_SOURCE_TABLE: Record<StorySource, string> = {
  announcement: "announcements", event: "events", poll: "polls", market: "marketplace_items", fixed: "service_tickets",
};
/** העמודות של הפריט לכל מקור — רק מה שהמיתון צריך לראות (כותרת, קטע, תמונה). */
export const STORY_ITEM_COLUMNS: Record<StorySource, string> = {
  announcement: "id, building_id, title, content",
  event: "id, building_id, title, location",
  poll: "id, building_id, question",
  market: "id, building_id, title, user_id, media_url, media_urls, media_type",
  fixed: "id, building_id, title",
};
export const STORY_REASONS = ["offensive", "private", "spam", "wrong", "other"] as const;
export type StoryReason = typeof STORY_REASONS[number];
export const STORY_REASON_LABEL: Record<StoryReason, string> = {
  offensive: "פוגעני או לא ראוי", private: "חושף מידע אישי", spam: "ספאם או פרסום", wrong: "לא נכון או לא עדכני", other: "משהו אחר",
};

/** העמודות שנקראות מהדיווחים — בלי reporter_id: מי דיווח לא מגיע לפאנל. */
export const STORY_REPORT_COLUMNS = "id, building_id, source, source_id, reason, created_at";
export const STORY_REPORTS_MAX = 300;
export const STORY_HIDDEN_MAX = 200;
// S345 (סקירת הסטורי #8): כמו בסטורי עצמו (180) — הצוות רואה את מה שהדיירים רואים
export const STORY_TEXT_MAX = 180;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isSource = (v: unknown): v is StorySource => typeof v === "string" && (STORY_SOURCES as readonly string[]).includes(v);
const isReason = (v: unknown): v is StoryReason => typeof v === "string" && (STORY_REASONS as readonly string[]).includes(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);
export const itemKey = (buildingId: string, source: StorySource, sourceId: string) => `${buildingId}:${source}:${sourceId}`;

export type StoryReportRow = { id: string; building_id: string; source: StorySource; source_id: string; reason: StoryReason; created_at: string };
/** הפריט כפי שהמיתון רואה אותו. gone — השורה כבר לא קיימת (נמחקה) — אין מה להסתיר. */
export type StoryItem = { title: string; text: string | null; photo: string | null; gone: boolean };
export type StoryReportGroup = {
  key: string; building_id: string; building: string; source: StorySource; source_id: string; item: StoryItem;
  count: number; reasons: Array<{ reason: StoryReason; label: string; count: number }>; first: string; last: string;
};
export type StoryHiddenRow = { building_id: string; building: string; source: StorySource; source_id: string; reason: string | null; hidden_by: string | null; created_at: string; item: StoryItem };
export type StoryPilotRow = { building_id: string; building: string; enabled_by: string | null; note: string | null; created_at: string };

/** שורות הדיווחים מה-DB → רק שורות תקינות (מזהים, מקור וסיבה מוכרים). */
export function parseReportRows(x: unknown): StoryReportRow[] {
  if (!Array.isArray(x)) return [];
  const out: StoryReportRow[] = [];
  for (const r of x as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const id = str(r.id), b = str(r.building_id), sid = str(r.source_id), at = str(r.created_at);
    if (!id || !UUID.test(id) || !b || !UUID.test(b) || !sid || !UUID.test(sid) || !at || !isSource(r.source) || !isReason(r.reason)) continue;
    out.push({ id, building_id: b, source: r.source, source_id: sid, reason: r.reason, created_at: at });
  }
  return out;
}

const clip = (s: string | null, max = STORY_TEXT_MAX) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
};
/**
 * תמונה של מודעה — רק מה שהמפרסם העלה ללוח של bloc (אותו כלל כמו ב-bloc: lib/market/media.isOwnMarketMedia; סקירת STORIES-1:
 * כתובת של אתר אחר הייתה נטענת בדפדפן של הצוות). ה-bucket chat_uploads, התיקייה של המפרסם, בלי פרמטרים ובלי "..".
 */
export function itemPhoto(r: Record<string, unknown>, supabaseUrl: string | null | undefined): string | null {
  if (r.media_type && r.media_type !== "image") return null;
  const uid = typeof r.user_id === "string" ? r.user_id.toLowerCase() : "";
  if (!uid || !supabaseUrl) return null;
  let origin: string;
  try { origin = new URL(supabaseUrl).origin; } catch { return null; }
  const prefix = `/storage/v1/object/public/chat_uploads/${uid}/`;
  const own = (u: string) => {
    if (!/^https:\/\/[^\s"'<>]+$/.test(u)) return false;
    let x: URL;
    try { x = new URL(u); } catch { return false; }
    if (x.origin !== origin || x.search || x.hash) return false;
    let path: string;
    try { path = decodeURIComponent(x.pathname); } catch { return false; }
    if (path.includes("..") || path.includes("//")) return false;
    const name = path.slice(prefix.length);
    return path.toLowerCase().startsWith(prefix) && name.length > 0 && !name.includes("/");
  };
  const list = Array.isArray(r.media_urls) ? r.media_urls : [];
  const first = [r.media_url, ...list].find((u): u is string => typeof u === "string" && own(u));
  return first ?? null;
}
/** שורה של מקור → הפריט (כותרת וקטע). */
export function storyItem(source: StorySource, r: Record<string, unknown> | undefined, supabaseUrl?: string | null): StoryItem {
  if (!r) return { title: "הפריט נמחק", text: null, photo: null, gone: true };
  const title = clip(str(source === "poll" ? r.question : r.title), 120) ?? "בלי כותרת";
  const text = source === "announcement" ? clip(str(r.content)) : source === "event" ? clip(str(r.location)) : null;
  return { title, text, photo: source === "market" ? itemPhoto(r, supabaseUrl) : null, gone: false };
}

/** התור: קבוצה לכל פריט — הכי הרבה דיווחים קודם, ואחר כך האחרון שדווח. */
export function groupStoryReports(rows: readonly StoryReportRow[], items: ReadonlyMap<string, StoryItem>, buildings: ReadonlyMap<string, string>): StoryReportGroup[] {
  const by = new Map<string, { rows: StoryReportRow[] }>();
  for (const r of rows) {
    const k = itemKey(r.building_id, r.source, r.source_id);
    const g = by.get(k) ?? { rows: [] };
    g.rows.push(r);
    by.set(k, g);
  }
  const out: StoryReportGroup[] = [];
  for (const [key, g] of by) {
    const r0 = g.rows[0];
    const counts = new Map<StoryReason, number>();
    for (const r of g.rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const times = g.rows.map((r) => r.created_at).sort();
    out.push({
      key, building_id: r0.building_id, building: buildings.get(r0.building_id) ?? "בניין לא ידוע", source: r0.source, source_id: r0.source_id,
      item: items.get(key) ?? storyItem(r0.source, undefined), count: g.rows.length,
      reasons: STORY_REASONS.filter((x) => counts.has(x)).map((x) => ({ reason: x, label: STORY_REASON_LABEL[x], count: counts.get(x)! })),
      first: times[0], last: times[times.length - 1],
    });
  }
  return out.sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

// ── הפעולות ─────────────────────────────────────────────────────────────────
const Uuid = z.string().regex(UUID, "מזהה לא תקין");
const Source = z.enum(STORY_SOURCES);
const Item = { building_id: Uuid, source: Source, source_id: Uuid };
export const storyActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hide"), ...Item, reason: z.string().trim().min(3, "סיבה: לפחות 3 תווים").max(300, "סיבה: עד 300 תווים") }).strict(),
  z.object({ action: z.literal("unhide"), ...Item }).strict(),
  z.object({ action: z.literal("dismiss"), ...Item }).strict(),
  z.object({ action: z.literal("pilot_on"), building_id: Uuid, note: z.string().trim().max(300, "הערה: עד 300 תווים").optional() }).strict(),
  z.object({ action: z.literal("pilot_off"), building_id: Uuid }).strict(),
  // S345
  z.object({ action: z.literal("global_on"), note: z.string().trim().max(300, "הערה: עד 300 תווים").optional() }).strict(),
  z.object({ action: z.literal("global_off"), note: z.string().trim().max(300, "הערה: עד 300 תווים").optional() }).strict(),
  z.object({ action: z.literal("building_off"), building_id: Uuid, note: z.string().trim().min(3, "סיבה: לפחות 3 תווים").max(300, "סיבה: עד 300 תווים") }).strict(),
  z.object({ action: z.literal("building_on"), building_id: Uuid }).strict(),
  z.object({ action: z.literal("refer"), ...Item, note: z.string().trim().max(300, "הערה: עד 300 תווים").optional() }).strict(),
]);
export type StoryAction = z.infer<typeof storyActionSchema>;
export const STORY_ACTION_AUDIT: Record<StoryAction["action"], string> = {
  hide: "STORY_HIDE", unhide: "STORY_UNHIDE", dismiss: "STORY_REPORTS_DISMISS", pilot_on: "STORIES_PILOT_ON", pilot_off: "STORIES_PILOT_OFF",
  global_on: "STORIES_GLOBAL_ON", global_off: "STORIES_GLOBAL_OFF", building_off: "STORIES_BUILDING_OFF", building_on: "STORIES_BUILDING_ON",
  refer: "STORY_REFER",
};
/** הפעולות של סופר-אדמין בלבד (stories.pilot): הפיילוט והמתג הראשי. */
export const isPilotAction = (a: StoryAction["action"]) => a === "pilot_on" || a === "pilot_off" || a === "global_on" || a === "global_off";

/** S345: בניין שהסטורי כבוי בו — צוות bloc (עם הסיבה) ו/או הוועד. */
export type StorySwitchRow = {
  building_id: string; building: string
  staff_off: boolean; staff_note: string | null; staff_by: string | null; staff_at: string | null
  committee_off: boolean; committee_at: string | null
};

/** מה ש-bloc החזיר → מה שהמסך מקבל; רק ok === true עם הפעולה ששלחנו נחשב הצלחה (אחרת — "ייתכן שבוצע"). */
export function storyAnswer(action: StoryAction["action"], data: Record<string, unknown>): { changed: boolean; closed: number | null } | null {
  if (data.ok !== true || data.action !== action || typeof data.changed !== "boolean") return null;
  return { changed: data.changed, closed: typeof data.closed === "number" && Number.isFinite(data.closed) ? data.closed : null };
}

/**
 * כשל מ-bloc → משפט בעברית למסך. קודי החיבור של callBloc (כל CONNECTION_CODES — גם EDGE_BLOCKED, OLD_BLOC, UPSTREAM_401…) — כמו
 * שהם: האבחנה של callBloc היא מה שהצוות צריך לראות. ייתכן שבוצע (פסק זמן, רשת, 5xx בלי קוד מוכר) — "לא ברור — רעננו".
 */
export function storyFailure(r: { status: number; error: string; code?: string }): { status: number; code: string; error: string } {
  const code = r.code ?? "";
  if (code && CONNECTION_CODES.has(code) && code !== "TIMEOUT" && code !== "NETWORK") return { status: r.status, code, error: r.error };
  if (adsOutcome(r) === "unknown") return { status: r.status >= 400 ? r.status : 502, code: code || "unknown", error: "לא ברור אם הפעולה בוצעה. רעננו את הרשימה." };
  if (r.status === 403) return { status: 403, code: code || "forbidden", error: "אין הרשאה לפעולה הזו." };
  if (r.status === 404) return { status: 404, code: code || "not_found", error: "הפריט או הבניין כבר לא קיימים. רעננו את הרשימה." };
  if (r.status === 400) return { status: 400, code: code || "invalid", error: "הבקשה לא תקינה. רעננו ונסו שוב." };
  if (code === "sql_missing") return { status: 503, code, error: "הסטורי עוד לא הותקן ב-bloc (SQL 235). אחרי ההתקנה נסו שוב." };
  if (code === "read_failed" || code === "write_failed") return { status: 503, code, error: "bloc לא הצליח לשמור כרגע. נסו שוב בעוד רגע." };
  if (code === "no_committee") return { status: 409, code, error: "לבניין אין ועד פעיל, ולכן אין למי להעביר. אפשר להסתיר מהסטורי." };
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: "הפעולה לא הצליחה. נסו שוב." };
}
