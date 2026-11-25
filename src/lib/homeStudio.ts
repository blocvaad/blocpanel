// src/lib/homeStudio.ts — bloc HOME-STUDIO-1 (החלטות 684–694; bloc SQL 256): "מסך הבית" — כרטיסים של bloc במסך הבית של
// הדיירים והוועד, שצוות bloc מנהל כאן בלבד (הוועד וחברת הניהול לא מנהלים כלום, 690). דפדפן ושרת, טהור (בלי I/O).
//   • הקבועים — עותק של bloc (src/lib/homeStudio/model.ts שם), נעול בטסט בשני הצדדים עם אותם ערכים מפורשים.
//   • כל תשובה של bloc נבדקת לפני שמוצגת (parse*): צורה לא מוכרת — null, והמסך אומר את זה (אף פעם לא "אין כרטיסים").
//   • הטופס ↔ הכרטיס: formFromCard / emptyForm / התבניות (694); payloadOf — מה ש-card.save שולח.
//   • הבדיקה בטופס (cardProblems) — אותם כללים כמו ב-bloc, כדי שהשגיאה תופיע ליד השדה לפני השמירה; bloc בודק שוב בכל מקרה.
//   • תוקף (694): "הסתיים" / "נגמר בעוד N ימים" / "מתחיל ב..."; יותר מ-2 כרטיסים פעילים — אזהרה (687: במסך מוצגים עד 2).
//   • סטטיסטיקה (689): ספירות ליום, בלי מי — צפיות, לחיצות, אחוז לחיצה, עומק בערימה, הגיעו לסוף.
import { z } from "zod";
import { addDaysKey, ilTodayKey } from "./broadcasts";
import { ilMidnightMs } from "./ads";
import { daysBetween } from "./adsStudio";
import { ilDate } from "./committee";
import { ADS_REFRESH_CODES, isOurAdImage } from "./adsUi";
import { CONNECTION_CODES } from "./moneyActions";
import { adsOutcome } from "./adsActions";

// ── צורות ──────────────────────────────────────────────────────────────────────
export const STUDIO_SHAPES = ["banner", "tile", "circles", "carousel", "list", "deck"] as const;
export type StudioShape = typeof STUDIO_SHAPES[number];
export const SHAPE_INFO: Record<StudioShape, { label: string; hint: string; min: number; max: number }> = {
  banner:   { label: "מלבן", hint: "כרטיס אחד לכל הרוחב", min: 1, max: 1 },
  tile:     { label: "ריבוע", hint: "שניים או ארבעה ריבועים", min: 2, max: 4 },
  circles:  { label: "עיגולים", hint: "שורת עיגולים, כל אחד נפתח למסך מלא", min: 2, max: 10 },
  carousel: { label: "גלילה אופקית", hint: "כרטיסים בשורה שגוללים הצידה", min: 2, max: 10 },
  list:     { label: "רשימה אנכית", hint: "שורות אחת מתחת לשנייה", min: 2, max: 6 },
  deck:     { label: "ערימה להחלקה", hint: "כרטיס מעל כרטיס, מחליקים ימינה לבא", min: 1, max: 8 },
};
/** ריבוע — 2 או 4 בלבד. */
export function itemCountOk(shape: StudioShape, n: number): boolean {
  const { min, max } = SHAPE_INFO[shape];
  if (n < min || n > max) return false;
  return shape === "tile" ? n === 2 || n === 4 : true;
}
export const itemsRule = (shape: StudioShape): string =>
  shape === "tile" ? "2 או 4" : SHAPE_INFO[shape].min === SHAPE_INFO[shape].max ? String(SHAPE_INFO[shape].min) : `${SHAPE_INFO[shape].min} עד ${SHAPE_INFO[shape].max}`;
/** כמה פריטים לשים כשעוברים לצורה (קרוב למה שיש). */
export function fitCount(shape: StudioShape, n: number): number {
  const { min, max } = SHAPE_INFO[shape];
  if (shape === "tile") return n >= 3 ? 4 : 2;
  return Math.min(max, Math.max(min, n));
}

// ── המקום במסך הבית ─────────────────────────────────────────────────────────────
export const STUDIO_SLOTS = [
  "top", "after_insights", "after_tiles", "after_main", "after_event", "after_holiday", "after_market",
  "after_weekly", "after_question", "after_happening", "after_progress", "end",
] as const;
export type StudioSlot = typeof STUDIO_SLOTS[number];
/** השורות של מסך הבית לפי הסדר, והמקום שאחרי כל אחת (bloc app/(main)/page.tsx). "end" — שורה חדשה בסוף. */
export const HOME_MAP: ReadonlyArray<{ row: string; slot: StudioSlot }> = [
  { row: "הכותרת", slot: "top" },
  { row: "היום בבניין", slot: "after_insights" },
  { row: "ארבעת הכפתורים", slot: "after_tiles" },
  { row: "המלבן הכחול (הבית שלי / המשימה הבאה)", slot: "after_main" },
  { row: "האירוע הקרוב", slot: "after_event" },
  { row: "החג", slot: "after_holiday" },
  { row: "חדש בלוח הקהילתי", slot: "after_market" },
  { row: "השבוע שלך (שישי ושבת)", slot: "after_weekly" },
  { row: "שאלת היום", slot: "after_question" },
  { row: "מה קורה בבניין", slot: "after_happening" },
  { row: "המדד והאתגר", slot: "after_progress" },
];
export const SLOT_LABEL: Record<StudioSlot, string> = {
  top: 'בראש המסך, לפני "היום בבניין"',
  after_insights: 'אחרי "היום בבניין"',
  after_tiles: "אחרי ארבעת הכפתורים",
  after_main: "אחרי המלבן הכחול",
  after_event: "אחרי האירוע הקרוב",
  after_holiday: "אחרי החג",
  after_market: 'אחרי "חדש בלוח הקהילתי"',
  after_weekly: 'אחרי "השבוע שלך"',
  after_question: 'אחרי "שאלת היום"',
  after_happening: 'אחרי "מה קורה בבניין"',
  after_progress: "אחרי המדד והאתגר",
  end: "שורה חדשה בסוף",
};

// ── מקור התוכן ──────────────────────────────────────────────────────────────────
export const STUDIO_SOURCES = ["manual", "whats_new"] as const;
export type StudioSource = typeof STUDIO_SOURCES[number];
// bloc (סקירה #3): בלי גלילה אופקית — אי אפשר לדעת מה מהעדכונים נראה
export const WHATS_NEW_SHAPES: readonly StudioShape[] = ["deck", "list", "circles"];
export const SOURCE_INFO: Record<StudioSource, { label: string; hint: string }> = {
  manual: { label: "מה שכותבים כאן", hint: "תמונות, כותרות, טקסט, קישור וכפתור, לבחירתך" },
  whats_new: { label: "מה חדש ב-bloc", hint: "העדכונים שפורסמו, ורק מה שהמשתמש עוד לא ראה. בלי עדכון חדש, הכרטיס לא מוצג" },
};

// ── צבע ואייקון ─────────────────────────────────────────────────────────────────
export const STUDIO_ACCENTS = ["brand", "green", "amber", "pink", "indigo"] as const;
export type StudioAccent = typeof STUDIO_ACCENTS[number];
/** הצבעים של bloc (globals.css שם) — לתצוגה בטלפון; ב-bloc הם טוקנים. */
export const ACCENT_INFO: Record<StudioAccent, { label: string; ink: string; light: string; line: string }> = {
  brand:  { label: "כחול", ink: "#1D4ED8", light: "#EFF6FF", line: "#BFDBFE" },
  green:  { label: "ירוק", ink: "#047857", light: "#EAF8F0", line: "#BFE8D0" },
  amber:  { label: "צהוב", ink: "#92400E", light: "#FFF8E6", line: "#FBE3A6" },
  pink:   { label: "ורוד", ink: "#EC4899", light: "#FDF2F8", line: "#FBCFE8" },
  indigo: { label: "סגול", ink: "#6366F1", light: "#EEF2FF", line: "#D9E0FA" },
};
export const STUDIO_ICONS = [
  "spark", "star", "crown", "gift", "bulb", "calendar", "chat", "shield", "heart", "home",
  "wrench", "bell", "megaphone", "vote", "clock", "leaf", "flame", "smile", "bolt", "users",
] as const;
export type StudioIcon = typeof STUDIO_ICONS[number];
export const ICON_LABEL: Record<StudioIcon, string> = {
  spark: "ניצוץ", star: "כוכב", crown: "כתר", gift: "מתנה", bulb: "נורה", calendar: "לוח שנה", chat: "צ'אט", shield: "מגן",
  heart: "לב", home: "בית", wrench: "מפתח ברגים", bell: "פעמון", megaphone: "הודעה", vote: "הצבעה", clock: "שעון", leaf: "עלה",
  flame: "להבה", smile: "חיוך", bolt: "ברק", users: "שכנים",
};

// ── קישור (693) ─────────────────────────────────────────────────────────────────
export const STUDIO_ROUTES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "/chat", label: "צ'אט הבניין" },
  { path: "/marketplace", label: "הלוח הקהילתי" },
  { path: "/events", label: "אירועים" },
  { path: "/announcements", label: "הודעות הוועד" },
  { path: "/votes", label: "הצבעות" },
  { path: "/services", label: "תקלות" },
  { path: "/payments", label: "תשלומים" },
  { path: "/maintenance", label: "תחזוקה" },
  { path: "/documents", label: "מסמכים" },
  { path: "/neighbors", label: "השכנים שלי" },
  { path: "/health", label: "מדד הבניין" },
  { path: "/building-knowledge", label: "מידע על הבניין" },
  { path: "/notifications", label: "התראות" },
  { path: "/profile", label: "הפרופיל שלי" },
  { path: "/settings", label: "הגדרות" },
  { path: "/upgrade", label: "המסלולים (לוועד)" },
];
const ROUTE_PATHS: readonly string[] = STUDIO_ROUTES.map((r) => r.path);
export const routeLabel = (path: string) => STUDIO_ROUTES.find((r) => r.path === path)?.label ?? path;
export type StudioLink = { kind: "route"; path: string } | { kind: "url"; url: string };
export const LINK_URL_MAX = 300;

/** כתובת https בטוחה (כמו ב-bloc): שם מארח עם נקודה, לא IP ולא localhost, בלי משתמש / סיסמה, עד 300 תווים. */
export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > LINK_URL_MAX || /\s/.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".") || /^[0-9.]+$/.test(host) || host.startsWith("[") || host === "localhost") return null;
  return u.href.length <= LINK_URL_MAX ? u.href : null;
}
export function parseLink(v: unknown): StudioLink | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "route") return typeof o.path === "string" && ROUTE_PATHS.includes(o.path) ? { kind: "route", path: o.path } : null;
  if (o.kind === "url") { const url = safeHttpsUrl(o.url); return url ? { kind: "url", url } : null; }
  return null;
}
/** הקישור של עדכון ("מה חדש") נשמר ב-bloc כטקסט אחד: נתיב או https. */
export function linkFromText(v: unknown): StudioLink | null {
  if (typeof v !== "string" || !v) return null;
  if (v.startsWith("/")) return ROUTE_PATHS.includes(v) ? { kind: "route", path: v } : null;
  const url = safeHttpsUrl(v);
  return url ? { kind: "url", url } : null;
}
export const linkText = (l: StudioLink | null): string => (!l ? "" : l.kind === "route" ? routeLabel(l.path) : l.url);

// ── גבולות ──────────────────────────────────────────────────────────────────────
export const LIMITS = {
  name: 80, cardTitle: 40, cardSubtitle: 80,
  itemTitle: 60, itemBody: 160, itemAlt: 120, cta: 20, badge: 16,
  updateTitle: 60, updateBody: 240,
  testEmails: 5, cities: 30, city: 40, newDaysMax: 90,
} as const;

// ── קהל ─────────────────────────────────────────────────────────────────────────
export type StudioRole = "tenant" | "vaad";
export const STUDIO_ROLES: ReadonlyArray<{ key: StudioRole; label: string }> = [{ key: "tenant", label: "דיירים" }, { key: "vaad", label: "ועד" }];
export type StudioPlan = "free" | "building" | "large" | "tower" | "company";
export const STUDIO_PLANS: ReadonlyArray<{ key: StudioPlan; label: string }> = [
  { key: "free", label: "התנסות" }, { key: "building", label: "Core" }, { key: "large", label: "Plus" }, { key: "tower", label: "Pro" },
  { key: "company", label: "Management Start" },
];

// ── מצב ─────────────────────────────────────────────────────────────────────────
export const STUDIO_STATUSES = ["draft", "test", "live", "paused", "archived"] as const;
export type StudioStatus = typeof STUDIO_STATUSES[number];
export const STATUS_LABEL: Record<StudioStatus, string> = { draft: "טיוטה", test: "בבדיקה", live: "פורסם", paused: "מושהה", archived: "בארכיון" };
export const STATUS_TONE: Record<StudioStatus, "muted" | "wait" | "ok" | "info"> = { draft: "muted", test: "info", live: "ok", paused: "wait", archived: "muted" };
export const STUDIO_FREQUENCIES = ["until_closed", "daily"] as const;
export type StudioFrequency = typeof STUDIO_FREQUENCIES[number];
export const FREQUENCY_LABEL: Record<StudioFrequency, string> = { until_closed: "עד שסוגרים (X)", daily: "סגירה עד מחר" };
/** כמה כרטיסים מהסטודיו במסך בית אחד (687). */
export const STUDIO_CAP = 2;
/** המעברים שמותרים ב-bloc (lib/homeStudio/panel.ts) — הכפתורים במסך לפיהם. */
export const CARD_TRANSITIONS: Readonly<Record<StudioStatus, readonly StudioStatus[]>> = {
  draft: ["test", "live", "archived"],
  test: ["draft", "live", "archived"],
  live: ["paused", "archived"],
  paused: ["live", "draft", "archived"],
  archived: ["draft"],
};
export const UPDATE_STATUSES = ["draft", "live", "archived"] as const;
export type UpdateStatus = typeof UPDATE_STATUSES[number];
export const UPDATE_STATUS_LABEL: Record<UpdateStatus, string> = { draft: "טיוטה", live: "פורסם", archived: "בארכיון" };
export const UPDATE_TRANSITIONS: Readonly<Record<UpdateStatus, readonly UpdateStatus[]>> = {
  draft: ["live", "archived"], live: ["draft", "archived"], archived: ["draft"],
};

// ── הכרטיס כפי ש-bloc מחזיר ─────────────────────────────────────────────────────
export type StudioItem = {
  id: string; title: string | null; body: string | null; image_url: string | null; image_alt: string | null
  icon: StudioIcon | null; accent: StudioAccent; link: StudioLink | null; cta: string | null; badge: string | null
};
export type StudioStyle = "soft" | "solid";
export type StudioContent = { title: string | null; subtitle: string | null; style: StudioStyle; countdown: boolean; items: StudioItem[] };
export type StudioAudience = { roles: StudioRole[]; cities: string[]; plans: StudioPlan[]; new_days: number | null; rollout: number };
export type StudioCard = {
  id: string; name: string; shape: StudioShape; slot: StudioSlot; position: number; source: StudioSource
  content: StudioContent; audience: StudioAudience; starts_at: string | null; ends_at: string | null; frequency: StudioFrequency
  status: StudioStatus; test_emails: string[]; version: number; created_by: string; updated_by: string | null
  created_at: string; updated_at: string; published_at: string | null
};
export type StudioUpdate = {
  id: string; title: string; body: string; image_url: string | null; link: string | null; roles: StudioRole[]; status: UpdateStatus
  version: number; created_by: string; updated_by: string | null; created_at: string; updated_at: string; published_at: string | null
};
export type Totals = { views: number; taps: number; closes: number; swipes: number; ends: number };
export type DayStats = { day: string } & Totals;
export type StudioListData = { enabled: boolean; cards: StudioCard[]; updates: StudioUpdate[]; totals: Record<string, Totals>; unknown: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const isWhen = (v: unknown) => v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

export function parseItem(v: unknown): StudioItem | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || !/^[a-z0-9]{1,16}$/.test(o.id)) return null;
  return {
    id: o.id, title: str(o.title), body: str(o.body), image_url: str(o.image_url), image_alt: str(o.image_alt),
    icon: inList(STUDIO_ICONS, o.icon) ? o.icon : null, accent: inList(STUDIO_ACCENTS, o.accent) ? o.accent : "brand",
    link: o.link == null ? null : parseLink(o.link), cta: str(o.cta), badge: str(o.badge),
  };
}
export function parseContent(v: unknown): StudioContent | null {
  const o = obj(v);
  if (!o) return null;
  const raw = Array.isArray(o.items) ? o.items : [];
  const items = raw.map(parseItem);
  if (items.some((i) => i === null)) return null;
  return { title: str(o.title), subtitle: str(o.subtitle), style: o.style === "solid" ? "solid" : "soft", countdown: o.countdown === true, items: items as StudioItem[] };
}
export function parseAudience(v: unknown): StudioAudience | null {
  const o = obj(v);
  if (!o || !Array.isArray(o.roles)) return null;
  const roles = (["tenant", "vaad"] as const).filter((r) => (o.roles as unknown[]).includes(r));
  const cities = Array.isArray(o.cities) ? o.cities.filter((c): c is string => typeof c === "string" && !!c.trim()) : [];
  const plans = Array.isArray(o.plans) ? STUDIO_PLANS.map((p) => p.key).filter((k) => (o.plans as unknown[]).includes(k)) : [];
  const nd = typeof o.new_days === "number" && Number.isInteger(o.new_days) && o.new_days >= 1 && o.new_days <= LIMITS.newDaysMax ? o.new_days : null;
  const ro = typeof o.rollout === "number" && Number.isInteger(o.rollout) && o.rollout >= 1 && o.rollout <= 100 ? o.rollout : 100;
  return { roles, cities, plans, new_days: nd, rollout: ro };
}
export function parseCard(v: unknown): StudioCard | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || !UUID.test(o.id) || typeof o.name !== "string") return null;
  if (!inList(STUDIO_SHAPES, o.shape) || !inList(STUDIO_SLOTS, o.slot) || !inList(STUDIO_SOURCES, o.source)) return null;
  if (!inList(STUDIO_STATUSES, o.status) || !inList(STUDIO_FREQUENCIES, o.frequency)) return null;
  if (typeof o.position !== "number" || !Number.isInteger(o.position) || typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) return null;
  if (!isWhen(o.starts_at) || !isWhen(o.ends_at) || !isWhen(o.published_at ?? null) || typeof o.created_at !== "string" || typeof o.updated_at !== "string") return null;
  const content = parseContent(o.content);
  const audience = parseAudience(o.audience);
  if (!content || !audience) return null;
  return {
    id: o.id.toLowerCase(), name: o.name, shape: o.shape, slot: o.slot, position: o.position, source: o.source, content, audience,
    starts_at: (o.starts_at as string | null) ?? null, ends_at: (o.ends_at as string | null) ?? null, frequency: o.frequency, status: o.status,
    test_emails: Array.isArray(o.test_emails) ? o.test_emails.filter((e): e is string => typeof e === "string") : [],
    version: o.version, created_by: typeof o.created_by === "string" ? o.created_by : "", updated_by: typeof o.updated_by === "string" ? o.updated_by : null,
    created_at: o.created_at, updated_at: o.updated_at, published_at: (o.published_at as string | null | undefined) ?? null,
  };
}
export function parseUpdate(v: unknown): StudioUpdate | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string" || !UUID.test(o.id) || typeof o.title !== "string" || typeof o.body !== "string") return null;
  if (!inList(UPDATE_STATUSES, o.status) || typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) return null;
  if (!Array.isArray(o.roles) || typeof o.created_at !== "string" || typeof o.updated_at !== "string" || !isWhen(o.published_at ?? null)) return null;
  return {
    id: o.id.toLowerCase(), title: o.title, body: o.body, image_url: str(o.image_url), link: str(o.link),
    roles: (["tenant", "vaad"] as const).filter((r) => (o.roles as unknown[]).includes(r)), status: o.status, version: o.version,
    created_by: typeof o.created_by === "string" ? o.created_by : "", updated_by: typeof o.updated_by === "string" ? o.updated_by : null,
    created_at: o.created_at, updated_at: o.updated_at, published_at: (o.published_at as string | null | undefined) ?? null,
  };
}
function parseTotalsRow(v: unknown): Totals | null {
  const o = obj(v);
  if (!o) return null;
  const t = { views: count(o.views), taps: count(o.taps), closes: count(o.closes), swipes: count(o.swipes), ends: count(o.ends) };
  return Object.values(t).every((x) => x !== null) ? t as Totals : null;
}
/** list → הכרטיסים, העדכונים, הספירות של 7 הימים והמתג. כרטיס / עדכון שהפאנל לא מכיר (bloc חדש יותר) — נספר ב-unknown. */
export function parseStudioList(d: Record<string, unknown>): StudioListData | null {
  if (d.ok !== true || typeof d.enabled !== "boolean" || !Array.isArray(d.cards) || !Array.isArray(d.updates)) return null;
  const totalsIn = obj(d.totals);
  if (!totalsIn) return null;
  let unknown = 0;
  const cards: StudioCard[] = [];
  for (const c of d.cards) { const p = parseCard(c); if (p) cards.push(p); else unknown++; }
  const updates: StudioUpdate[] = [];
  for (const u of d.updates) { const p = parseUpdate(u); if (p) updates.push(p); else unknown++; }
  const totals: Record<string, Totals> = {};
  for (const [k, v] of Object.entries(totalsIn)) { const t = parseTotalsRow(v); if (t && UUID.test(k)) totals[k.toLowerCase()] = t; }
  return { enabled: d.enabled, cards, updates, totals, unknown };
}
export function parseCardAnswer(d: Record<string, unknown>): StudioCard | null {
  return d.ok === true ? parseCard(d.card) : null;
}
export function parseUpdateAnswer(d: Record<string, unknown>): StudioUpdate | null {
  return d.ok === true ? parseUpdate(d.update) : null;
}
export function parseStats(d: Record<string, unknown>): DayStats[] | null {
  if (d.ok !== true || !Array.isArray(d.days)) return null;
  const out: DayStats[] = [];
  for (const r of d.days) {
    const o = obj(r);
    const t = parseTotalsRow(r);
    if (!o || !t || typeof o.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.day)) return null;
    out.push({ day: o.day, ...t });
  }
  return out;
}
export function parseSwitchAnswer(d: Record<string, unknown>): { enabled: boolean; changed: boolean } | null {
  return d.ok === true && typeof d.enabled === "boolean" && typeof d.changed === "boolean" ? { enabled: d.enabled, changed: d.changed } : null;
}

// ── הטופס ───────────────────────────────────────────────────────────────────────
export type LinkKind = "none" | "route" | "url";
export type ItemForm = {
  id: string; title: string; body: string; image_url: string; image_alt: string; icon: StudioIcon | ""; accent: StudioAccent
  link_kind: LinkKind; route: string; url: string; cta: string; badge: string
};
export type CardForm = {
  id: string | null; version: number | null; name: string; shape: StudioShape; slot: StudioSlot; position: number; source: StudioSource
  title: string; subtitle: string; style: StudioStyle; countdown: boolean; items: ItemForm[]
  roles: StudioRole[]; cities: string; plans: StudioPlan[]; new_days: string; rollout: string
  /** ימים לפי שעון ישראל (YYYY-MM-DD) — מההתחלה של היום הראשון עד הסוף של היום האחרון (כולל). ריק — בלי. */
  start_day: string; end_day: string; frequency: StudioFrequency
};

/** מזהה לפריט: 8 אותיות וספרות, לא כמו אף אחד אחר בכרטיס (אחרי 20 ניסיונות — מספר רץ, אף פעם לא לולאה בלי סוף). */
export function newItemId(taken: readonly string[], rand: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let tries = 0; tries < 20; tries++) {
    let s = "";
    for (let i = 0; i < 8; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
    if (!taken.includes(s)) return s;
  }
  for (let n = 1; ; n++) { const s = `item${n}`; if (!taken.includes(s)) return s; }
}
export function emptyItem(id: string, o: Partial<ItemForm> = {}): ItemForm {
  return { id, title: "", body: "", image_url: "", image_alt: "", icon: "", accent: "brand", link_kind: "none", route: "/chat", url: "", cta: "", badge: "", ...o };
}
export function itemFormOf(i: StudioItem): ItemForm {
  return emptyItem(i.id, {
    title: i.title ?? "", body: i.body ?? "", image_url: i.image_url ?? "", image_alt: i.image_alt ?? "", icon: i.icon ?? "", accent: i.accent,
    link_kind: i.link ? i.link.kind : "none", route: i.link?.kind === "route" ? i.link.path : "/chat", url: i.link?.kind === "url" ? i.link.url : "",
    cta: i.cta ?? "", badge: i.badge ?? "",
  });
}
/** היום האחרון (כולל) של ends_at, שאינו כולל — היום של הרגע שלפניו. */
export const lastDayOf = (endsAt: string) => ilTodayKey(new Date(Date.parse(endsAt) - 1));
export function formFromCard(c: StudioCard): CardForm {
  return {
    id: c.id, version: c.version, name: c.name, shape: c.shape, slot: c.slot, position: c.position, source: c.source,
    title: c.content.title ?? "", subtitle: c.content.subtitle ?? "", style: c.content.style, countdown: c.content.countdown,
    items: c.content.items.map(itemFormOf),
    roles: [...c.audience.roles], cities: c.audience.cities.join(", "), plans: [...c.audience.plans],
    new_days: c.audience.new_days === null ? "" : String(c.audience.new_days), rollout: String(c.audience.rollout),
    start_day: c.starts_at ? ilTodayKey(new Date(c.starts_at)) : "", end_day: c.ends_at ? lastDayOf(c.ends_at) : "", frequency: c.frequency,
  };
}
export function emptyForm(slot: StudioSlot = "after_tiles", ids: () => string = () => newItemId([])): CardForm {
  return {
    id: null, version: null, name: "", shape: "banner", slot, position: 0, source: "manual",
    title: "", subtitle: "", style: "soft", countdown: false, items: [emptyItem(ids())],
    roles: ["tenant", "vaad"], cities: "", plans: [], new_days: "", rollout: "100", start_day: "", end_day: "", frequency: "until_closed",
  };
}
/** מעבר צורה: מספר הפריטים מתאים את עצמו (ריבוע 2 / 4, מלבן 1), בלי למחוק פריט שכבר מולא כשלא צריך. */
export function withShape(f: CardForm, shape: StudioShape, ids: (taken: string[]) => string = (t) => newItemId(t)): CardForm {
  const want = f.source === "whats_new" ? f.items.length : fitCount(shape, f.items.length);
  const items = f.items.slice(0, Math.max(want, 0));
  while (items.length < want) items.push(emptyItem(ids(items.map((i) => i.id))));
  return { ...f, shape, items };
}

/** "תל אביב, חיפה" → ["תל אביב", "חיפה"] (פסיק עברי או רגיל, בלי ריקים וכפולים). */
export function citiesOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,،\n]/)) {
    const c = raw.replace(/\s+/g, " ").trim();
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out;
}
const intOf = (s: string): number | null => (/^\s*\d+\s*$/.test(s) ? Number(s.trim()) : null);
const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function itemPayload(i: ItemForm): Record<string, unknown> {
  const image = orNull(i.image_url);
  const link = i.link_kind === "route" ? { kind: "route", path: i.route } : i.link_kind === "url" ? { kind: "url", url: i.url.trim() } : null;
  return {
    id: i.id, title: orNull(i.title), body: orNull(i.body), image_url: image, image_alt: image ? orNull(i.image_alt) : null,
    icon: i.icon || null, accent: i.accent, link, cta: orNull(i.cta), badge: orNull(i.badge),
  };
}
/** הימים בשעון ישראל → הרגעים ש-bloc שומר: מתחילת היום הראשון; עד תחילת היום שאחרי האחרון (לא כולל). */
export const startIso = (day: string) => new Date(ilMidnightMs(day)).toISOString();
export const endIso = (day: string) => new Date(ilMidnightMs(addDaysKey(day, 1))).toISOString();
/** מה ש-card.save שולח (בלי action / actor). */
export function payloadOf(f: CardForm): Record<string, unknown> {
  const nd = intOf(f.new_days);
  const ro = intOf(f.rollout);
  return {
    ...(f.id ? { id: f.id, version: f.version ?? 1 } : {}),
    name: f.name.trim(), shape: f.shape, slot: f.slot, position: f.position, source: f.source,
    content: {
      title: orNull(f.title), subtitle: orNull(f.subtitle), style: f.style, countdown: f.countdown,
      items: f.source === "manual" ? f.items.map(itemPayload) : [],
    },
    audience: { roles: f.roles, cities: citiesOf(f.cities), plans: f.plans, new_days: f.new_days.trim() ? nd ?? -1 : null, rollout: f.rollout.trim() ? ro ?? -1 : 100 },
    starts_at: f.start_day ? startIso(f.start_day) : null,
    ends_at: f.end_day ? endIso(f.end_day) : null,
    frequency: f.frequency,
  };
}

// ── הבדיקה בטופס (אותם כללים כמו ב-bloc) ───────────────────────────────────────
export type Problem = { field: string; text: string };
const over = (s: string, max: number) => s.trim().length > max;
export function cardProblems(f: CardForm, imageBase: string | null): Problem[] {
  const p: Problem[] = [];
  if (!f.name.trim()) p.push({ field: "name", text: "תנו לכרטיס שם (רק הצוות רואה אותו)." });
  else if (over(f.name, LIMITS.name)) p.push({ field: "name", text: `השם ארוך מ-${LIMITS.name} תווים.` });
  if (f.source === "whats_new" && !WHATS_NEW_SHAPES.includes(f.shape)) p.push({ field: "shape", text: '"מה חדש ב-bloc" מוצג בערימה, ברשימה או בעיגולים.' });
  if (over(f.title, LIMITS.cardTitle)) p.push({ field: "title", text: `הכותרת ארוכה מ-${LIMITS.cardTitle} תווים.` });
  if (over(f.subtitle, LIMITS.cardSubtitle)) p.push({ field: "subtitle", text: `המשפט ארוך מ-${LIMITS.cardSubtitle} תווים.` });
  if (f.source === "manual") {
    if (!itemCountOk(f.shape, f.items.length)) p.push({ field: "items", text: `ל${SHAPE_INFO[f.shape].label} צריך ${itemsRule(f.shape)} פריטים.` });
    f.items.forEach((i, n) => {
      const at = `items.${n}`;
      const name = `פריט ${n + 1}`;
      const image = i.image_url.trim();
      if (!image && !i.title.trim()) p.push({ field: at, text: `${name}: צריך תמונה או כותרת.` });
      if (image && isOurAdImage(image, imageBase) === false) p.push({ field: `${at}.image_url`, text: `${name}: העלו את התמונה בכפתור ההעלאה.` });
      if (over(i.title, LIMITS.itemTitle)) p.push({ field: `${at}.title`, text: `${name}: הכותרת ארוכה מ-${LIMITS.itemTitle} תווים.` });
      if (over(i.body, LIMITS.itemBody)) p.push({ field: `${at}.body`, text: `${name}: הטקסט ארוך מ-${LIMITS.itemBody} תווים.` });
      if (over(i.image_alt, LIMITS.itemAlt)) p.push({ field: `${at}.image_alt`, text: `${name}: התיאור של התמונה ארוך מ-${LIMITS.itemAlt} תווים.` });
      if (over(i.cta, LIMITS.cta)) p.push({ field: `${at}.cta`, text: `${name}: הכפתור ארוך מ-${LIMITS.cta} תווים.` });
      if (over(i.badge, LIMITS.badge)) p.push({ field: `${at}.badge`, text: `${name}: התגית ארוכה מ-${LIMITS.badge} תווים.` });
      if (i.link_kind === "route" && !ROUTE_PATHS.includes(i.route)) p.push({ field: `${at}.link`, text: `${name}: בחרו מסך מהרשימה.` });
      if (i.link_kind === "url" && !safeHttpsUrl(i.url)) p.push({ field: `${at}.link`, text: `${name}: כתובת מלאה שמתחילה ב-https://` });
      if (i.cta.trim() && i.link_kind === "none") p.push({ field: `${at}.cta`, text: `${name}: כפתור צריך קישור.` });
    });
  }
  if (f.roles.length === 0) p.push({ field: "roles", text: "בחרו למי להציג: דיירים, ועד או שניהם." });
  const cities = citiesOf(f.cities);
  if (cities.length > LIMITS.cities) p.push({ field: "cities", text: `עד ${LIMITS.cities} ערים.` });
  else if (cities.some((c) => c.length > LIMITS.city)) p.push({ field: "cities", text: `שם עיר ארוך מ-${LIMITS.city} תווים.` });
  if (f.new_days.trim()) { const n = intOf(f.new_days); if (n === null || n < 1 || n > LIMITS.newDaysMax) p.push({ field: "new_days", text: `משתמשים חדשים: מספר ימים בין 1 ל-${LIMITS.newDaysMax}.` }); }
  { const r = intOf(f.rollout); if (r === null || r < 1 || r > 100) p.push({ field: "rollout", text: "אחוז בין 1 ל-100." }); }
  if (f.start_day && f.end_day && f.end_day < f.start_day) p.push({ field: "window", text: "היום האחרון לפני היום הראשון." });
  return p;
}
/** תאריך הסיום כבר עבר — אפשר לשמור, אי אפשר לפרסם (bloc: ended). */
export const endedForm = (f: Pick<CardForm, "end_day">, now: Date) => !!f.end_day && Date.parse(endIso(f.end_day)) <= now.getTime();

// ── תוקף, ספירה ומפה ────────────────────────────────────────────────────────────
export type Validity = { text: string; tone: "muted" | "wait" | "info" };
export function validity(c: Pick<StudioCard, "starts_at" | "ends_at">, now: Date): Validity | null {
  const t = now.getTime();
  if (c.ends_at && Date.parse(c.ends_at) <= t) return { text: "הסתיים", tone: "muted" };
  if (c.starts_at && Date.parse(c.starts_at) > t) return { text: `מתחיל ב-${ilDate(c.starts_at)}`, tone: "info" };
  if (!c.ends_at) return null;
  const days = daysBetween(ilTodayKey(now), lastDayOf(c.ends_at));
  if (days <= 0) return { text: "נגמר היום", tone: "wait" };
  if (days === 1) return { text: "נגמר מחר", tone: "wait" };
  return { text: `נגמר בעוד ${days} ימים`, tone: days <= 3 ? "wait" : "info" };
}
/** "נשארו עוד N ימים" (694, כמו countdownText של bloc): עד היום האחרון שבו הכרטיס מוצג; אחרי הסיום / בלי תאריך — null. */
export function countdownText(endsAt: string | null | undefined, now: Date): string | null {
  if (!endsAt) return null;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end) || end <= now.getTime()) return null;
  const days = daysBetween(ilTodayKey(now), lastDayOf(endsAt));
  if (days <= 0) return "היום האחרון";
  if (days === 1) return "נשאר עוד יום";
  if (days === 2) return "נשארו עוד יומיים";
  return `נשארו עוד ${days} ימים`;
}
/** הטקסט החלופי של תמונה (692): מה שנכתב, אחרת הכותרת של הפריט / הכרטיס, אחרת "פרסום של bloc". */
export function itemAlt(item: Pick<StudioItem, "image_alt" | "title">, cardTitle?: string | null): string {
  return item.image_alt?.trim() || item.title?.trim() || cardTitle?.trim() || "פרסום של bloc";
}
/** פורסם ובתוך החלון — מוצג עכשיו (לפי הקהל). */
export const liveNow = (c: Pick<StudioCard, "status" | "starts_at" | "ends_at">, now: Date) =>
  c.status === "live" && (!c.starts_at || Date.parse(c.starts_at) <= now.getTime()) && (!c.ends_at || Date.parse(c.ends_at) > now.getTime());
export const liveCount = (cards: readonly StudioCard[], now: Date) => cards.filter((c) => liveNow(c, now)).length;
/** הכרטיסים במקום (בלי ארכיון), לפי position ואז החדש. */
export function slotCards(cards: readonly StudioCard[], slot: StudioSlot): StudioCard[] {
  return cards.filter((c) => c.slot === slot && c.status !== "archived")
    .sort((a, b) => a.position - b.position || b.updated_at.localeCompare(a.updated_at));
}

export const ZERO: Totals = { views: 0, taps: 0, closes: 0, swipes: 0, ends: 0 };
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("he-IL");
/** אחוז (עד ספרה אחת אחרי הנקודה); בלי בסיס — "—" (לא 0%). */
export const pct = (part: number, whole: number) => (whole > 0 ? `${fmt1((part / whole) * 100)}%` : "—");
export function sumDays(days: readonly DayStats[]): Totals {
  const t = { ...ZERO };
  for (const d of days) { t.views += d.views; t.taps += d.taps; t.closes += d.closes; t.swipes += d.swipes; t.ends += d.ends; }
  return t;
}
/** הסיכום של כרטיס: אחוז לחיצה; בערימה — כמה כרטיסים בממוצע לכל צפייה (1 + החלקות / צפיות); ערימה ועיגולים — הגיעו לסוף. */
export function statsSummary(t: Totals, shape: StudioShape): { ctr: string; depth: string | null; ended: string | null } {
  return {
    ctr: pct(t.taps, t.views),
    depth: shape === "deck" ? (t.views > 0 ? fmt1(1 + t.swipes / t.views) : "—") : null,
    ended: shape === "deck" || shape === "circles" ? pct(t.ends, t.views) : null,
  };
}
/** 30 הימים האחרונים (בשעון ישראל), עם 0 ביום שאין בו שורה — לעמודות. */
export function fillDays(days: readonly DayStats[], todayKey: string, n = 30): DayStats[] {
  const by = new Map(days.map((d) => [d.day, d]));
  const out: DayStats[] = [];
  for (let i = n - 1; i >= 0; i--) { const k = addDaysKey(todayKey, -i); out.push(by.get(k) ?? { day: k, ...ZERO }); }
  return out;
}

// ── "מה חדש ב-bloc": הטופס ──────────────────────────────────────────────────────
export type UpdateForm = { id: string | null; version: number | null; title: string; body: string; image_url: string; link_kind: LinkKind; route: string; url: string; roles: StudioRole[] };
export function emptyUpdateForm(): UpdateForm {
  return { id: null, version: null, title: "", body: "", image_url: "", link_kind: "none", route: "/chat", url: "", roles: ["tenant", "vaad"] };
}
export function updateFormOf(u: StudioUpdate): UpdateForm {
  const l = linkFromText(u.link);
  return { id: u.id, version: u.version, title: u.title, body: u.body, image_url: u.image_url ?? "", link_kind: l ? l.kind : "none",
    route: l?.kind === "route" ? l.path : "/chat", url: l?.kind === "url" ? l.url : "", roles: [...u.roles] };
}
export function updatePayload(f: UpdateForm): Record<string, unknown> {
  return {
    ...(f.id ? { id: f.id, version: f.version ?? 1 } : {}),
    title: f.title.trim(), body: f.body.trim(), image_url: orNull(f.image_url),
    link: f.link_kind === "route" ? { kind: "route", path: f.route } : f.link_kind === "url" ? { kind: "url", url: f.url.trim() } : null,
    roles: f.roles,
  };
}
export function updateProblems(f: UpdateForm, imageBase: string | null): Problem[] {
  const p: Problem[] = [];
  if (!f.title.trim()) p.push({ field: "title", text: "כתבו כותרת." });
  else if (over(f.title, LIMITS.updateTitle)) p.push({ field: "title", text: `הכותרת ארוכה מ-${LIMITS.updateTitle} תווים.` });
  if (!f.body.trim()) p.push({ field: "body", text: "כתבו משפט או שניים: מה חדש ולמה זה טוב." });
  else if (over(f.body, LIMITS.updateBody)) p.push({ field: "body", text: `הטקסט ארוך מ-${LIMITS.updateBody} תווים.` });
  if (f.image_url.trim() && isOurAdImage(f.image_url.trim(), imageBase) === false) p.push({ field: "image_url", text: "העלו את התמונה בכפתור ההעלאה." });
  if (f.link_kind === "route" && !ROUTE_PATHS.includes(f.route)) p.push({ field: "link", text: "בחרו מסך מהרשימה." });
  if (f.link_kind === "url" && !safeHttpsUrl(f.url)) p.push({ field: "link", text: "כתובת מלאה שמתחילה ב-https://" });
  if (f.roles.length === 0) p.push({ field: "roles", text: "בחרו למי להציג." });
  return p;
}
/** עדכון כפי שהוא נראה בכרטיס "מה חדש" (כמו updateItem של bloc: תגית "חדש", כפתור "לנסות עכשיו" כשיש קישור). */
export function updateAsItem(u: Pick<StudioUpdate, "id" | "title" | "body" | "image_url" | "link">): StudioItem {
  const link = linkFromText(u.link);
  return { id: `u${u.id.replace(/-/g, "").toLowerCase()}`, title: u.title, body: u.body, image_url: u.image_url, image_alt: null,
    icon: "spark", accent: "brand", link, cta: link ? "לנסות עכשיו" : null, badge: "חדש" };
}

// ── התצוגה החיה ─────────────────────────────────────────────────────────────────
/** כמה עדכונים כרטיס "מה חדש" מציג (כמו UPDATES_ITEMS_MAX של bloc). */
export const UPDATES_ITEMS_MAX = 8;
export type PreviewCard = {
  shape: StudioShape; source: StudioSource; title: string | null; subtitle: string | null; style: StudioStyle; items: StudioItem[]
  dismiss: StudioFrequency; test: boolean; countdown_to: string | null
};
export function itemFromForm(i: ItemForm): StudioItem {
  const link = i.link_kind === "route" ? parseLink({ kind: "route", path: i.route }) : i.link_kind === "url" ? parseLink({ kind: "url", url: i.url }) : null;
  const image = i.image_url.trim() || null;
  return {
    id: i.id, title: i.title.trim() || null, body: i.body.trim() || null, image_url: image, image_alt: image ? i.image_alt.trim() || null : null,
    icon: i.icon || null, accent: i.accent, link, cta: link ? i.cta.trim() || null : null, badge: i.badge.trim() || null,
  };
}
/**
 * מה הטלפון מציג לטופס, לתפקיד שנבחר: הפריטים (ידני — מה שיש בו תמונה או כותרת; "מה חדש" — העדכונים שפורסמו לתפקיד, החדש
 * קודם). hidden: 'audience' — התפקיד לא בקהל; 'empty' — אין מה להציג (ב-bloc הכרטיס לא יוצג).
 */
/** כמו ב-bloc (lib/homeStudio/server): "מה חדש" — מ-45 הימים האחרונים בלוח של ישראל; ברשימה — עד 6 (סקירה #11). */
export const UPDATES_WINDOW_DAYS = 45;
export const UPDATES_LIST_MAX = 6;
export function previewOf(f: CardForm, updates: readonly StudioUpdate[], role: StudioRole, now: Date = new Date()): { card: PreviewCard; hidden: "audience" | "empty" | null } {
  const since = ilMidnightMs(addDaysKey(ilTodayKey(now), -UPDATES_WINDOW_DAYS));
  const items = f.source === "whats_new"
    ? updates.filter((u) => u.status === "live" && u.roles.includes(role) && !!u.published_at && Date.parse(u.published_at) >= since)
        .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
        .slice(0, f.shape === "list" ? UPDATES_LIST_MAX : UPDATES_ITEMS_MAX).map(updateAsItem)
    : f.items.map(itemFromForm).filter((i) => i.image_url || i.title);
  const card: PreviewCard = {
    shape: f.shape, source: f.source, title: f.title.trim() || null, subtitle: f.subtitle.trim() || null, style: f.style, items,
    dismiss: f.frequency, test: false, countdown_to: f.countdown && f.end_day ? endIso(f.end_day) : null,
  };
  return { card, hidden: !f.roles.includes(role) ? "audience" : items.length === 0 ? "empty" : null };
}

// ── התבניות (694) ───────────────────────────────────────────────────────────────
export type StudioTemplate = { key: string; label: string; hint: string; shape: StudioShape; build: (ids: () => string) => Partial<CardForm> };
export const STUDIO_TEMPLATES: readonly StudioTemplate[] = [
  { key: "whats_new", label: "מה חדש ב-bloc", hint: "ערימה להחלקה מהעדכונים שפורסמו", shape: "deck",
    build: () => ({ name: "מה חדש ב-bloc", shape: "deck", source: "whats_new", slot: "after_tiles", title: "מה חדש ב-bloc", subtitle: "החליקו כדי לראות", items: [] }) },
  { key: "tip", label: "טיפ", hint: "מלבן עם אייקון וטקסט קצר", shape: "banner",
    build: (ids) => ({ name: "טיפ", shape: "banner", slot: "after_main", frequency: "daily", items: [emptyItem(ids(), {
      icon: "bulb", accent: "amber", title: "ידעתם?", body: "אפשר לצלם תקלה, ו-bloc AI ימלא את הפרטים בשבילכם.", link_kind: "route", route: "/services", cta: "לתקלות" })] }) },
  { key: "promo", label: "תמונה עם קישור", hint: "רק תמונה, לחיצה עליה פותחת את הקישור", shape: "banner",
    build: (ids) => ({ name: "תמונה עם קישור", shape: "banner", slot: "top", countdown: true, items: [emptyItem(ids(), { link_kind: "url", url: "https://" })] }) },
  { key: "feature", label: "הכירו את bloc", hint: "גלילה אופקית של שלושה מסכים", shape: "carousel",
    build: (ids) => ({ name: "הכירו את bloc", shape: "carousel", slot: "after_event", title: "הכירו את bloc", items: [
      emptyItem(ids(), { icon: "chat", accent: "brand", title: "צ'אט הבניין", body: "כל השכנים במקום אחד", link_kind: "route", route: "/chat", cta: "לצ'אט" }),
      emptyItem(ids(), { icon: "calendar", accent: "pink", title: "אירועים", body: "מה קורה בבניין השבוע", link_kind: "route", route: "/events", cta: "לאירועים" }),
      emptyItem(ids(), { icon: "vote", accent: "indigo", title: "הצבעות", body: "מחליטים יחד, בלחיצה", link_kind: "route", route: "/votes", cta: "להצבעות" }),
    ] }) },
  { key: "shortcuts", label: "קיצורי דרך", hint: "ארבעה ריבועים למסכים", shape: "tile",
    build: (ids) => ({ name: "קיצורי דרך", shape: "tile", slot: "after_happening", title: "קיצורי דרך", items: [
      emptyItem(ids(), { icon: "users", accent: "green", title: "הלוח הקהילתי", link_kind: "route", route: "/marketplace" }),
      emptyItem(ids(), { icon: "calendar", accent: "pink", title: "אירועים", link_kind: "route", route: "/events" }),
      emptyItem(ids(), { icon: "wrench", accent: "amber", title: "תקלות", link_kind: "route", route: "/services" }),
      emptyItem(ids(), { icon: "home", accent: "brand", title: "מידע על הבניין", link_kind: "route", route: "/building-knowledge" }),
    ] }) },
  { key: "stories", label: "עיגולים", hint: "שורת עיגולים שנפתחים למסך מלא", shape: "circles",
    build: (ids) => ({ name: "עיגולים", shape: "circles", slot: "top", items: [
      emptyItem(ids(), { icon: "spark", accent: "brand", title: "חדש", body: "מה חדש באפליקציה החודש." }),
      emptyItem(ids(), { icon: "bulb", accent: "amber", title: "טיפ", body: "טיפ קצר לשכנים." }),
      emptyItem(ids(), { icon: "heart", accent: "pink", title: "קהילה", body: "משהו טוב שקרה בבניין." }),
    ] }) },
];
/** טופס חדש מתבנית (או ריק) — תמיד טיוטה; המקום מה"+ כאן" גובר על המקום של התבנית. */
export function formFromTemplate(key: string | null, slot: StudioSlot | null, rand: () => number = Math.random): CardForm {
  const taken: string[] = [];
  const ids = () => { const id = newItemId(taken, rand); taken.push(id); return id; };
  const t = STUDIO_TEMPLATES.find((x) => x.key === key);
  const base = emptyForm(slot ?? "after_tiles", ids);
  if (!t) return base;
  const built = t.build(ids);
  return { ...base, ...built, slot: slot ?? built.slot ?? base.slot };
}

// ── כשל ─────────────────────────────────────────────────────────────────────────
export const HS_SQL_MISSING_TEXT = "המסך מוכן, אבל ב-bloc עוד לא הורץ SQL 256. אחרי שהוא ירוץ, הכרטיסים יופיעו כאן.";
export const HS_BAD_SHAPE_TEXT = "התשובה מ-bloc לא בצורה המוכרת (ייתכן שהגרסה של bloc ישנה). נסו שוב אחרי הפריסה.";
export const HS_UNCLEAR_TEXT = "לא ברור אם הפעולה בוצעה. רעננו את הדף לפני שמנסים שוב.";
const FIELD_NAME: Record<string, string> = {
  name: "השם", shape: "הצורה", "content.title": "הכותרת", "content.subtitle": "המשפט", "content.items": "הפריטים", audience: "הקהל",
  "audience.roles": "למי", "audience.cities": "הערים", "audience.plans": "המסלולים", "audience.new_days": "משתמשים חדשים", "audience.rollout": "האחוז",
  window: "התאריכים", test_emails: "המיילים לבדיקה", title: "הכותרת", body: "הטקסט", image_url: "התמונה", link: "הקישור", roles: "למי",
};
/** "content.items.2.cta" → "פריט 3: הכפתור". */
export function fieldText(field: string | undefined | null): string | null {
  if (!field) return null;
  const m = /^content\.items\.(\d+)(?:\.(\w+))?/.exec(field);
  if (m) {
    const part: Record<string, string> = { title: "הכותרת", body: "הטקסט", image_url: "התמונה", image_alt: "התיאור של התמונה", cta: "הכפתור", badge: "התגית", link: "הקישור", id: "המזהה", icon: "האייקון", accent: "הצבע" };
    return `פריט ${Number(m[1]) + 1}${m[2] ? `: ${part[m[2]] ?? m[2]}` : ""}`;
  }
  return FIELD_NAME[field] ?? FIELD_NAME[field.split(".").slice(0, 2).join(".")] ?? null;
}
/** "content.items.2.cta" → "items.2.cta" (השדה בטופס). */
export const formField = (field: string | undefined | null) => (field ? field.replace(/^content\./, "").replace(/^audience\./, "") : null);

export type HsFailure = { status: number; code: string; error: string; field?: string };
/** כשל של bloc → המשפט שהצוות רואה. read — קריאה; action — פעולה (שם "לא ברור" כשייתכן שבוצע). */
export function hsFailure(r: { status: number; error: string; code?: string; data?: Record<string, unknown> }, kind: "read" | "action"): HsFailure {
  const code = r.code ?? "";
  const field = typeof r.data?.field === "string" ? r.data.field : undefined;
  const where = fieldText(field);
  const at = (status: number, error: string) => ({ status, code: code || "failed", error, ...(field ? { field } : {}) });
  if (code && CONNECTION_CODES.has(code) && code !== "TIMEOUT" && code !== "NETWORK") return { status: r.status, code, error: r.error };
  // לא ברור אם בוצע — תמיד קוד שהדפדפן מזהה כ"לא ברור" (ADS_REFRESH_CODES), גם בלי קוד מ-bloc (500 / 504 של הפלטפורמה): העורך ננעל
  // עד רענון, ו"שמירה" לא יוצרת כרטיס פעמיים (סקירה #4)
  if (kind === "action" && adsOutcome(r) === "unknown") return { status: r.status >= 400 ? r.status : 502, code: code && ADS_REFRESH_CODES.has(code) ? code : "unclear", error: HS_UNCLEAR_TEXT };
  if (r.status === 403) return at(403, "אין הרשאה לנהל את מסך הבית.");
  if (code === "not_found") return at(404, "הכרטיס לא נמצא (אולי נמחק). רעננו את הרשימה.");
  if (code === "changed") return at(409, "מישהו אחר שמר שינוי בינתיים. רעננו את הדף, ואז ערכו שוב.");
  if (code === "transition") return at(409, "אי אפשר לעבור למצב הזה מהמצב הנוכחי. רעננו את הדף.");
  if (code === "ended") return at(409, "תאריך הסיום כבר עבר. עדכנו את התאריכים ושמרו, ואז פרסמו.");
  if (code === "archived") return at(409, "הכרטיס בארכיון. החזירו אותו לטיוטה כדי לערוך.");
  if (code === "items_count") return at(400, "מספר הפריטים לא מתאים לצורה.");
  if (code === "item_empty") return at(400, `${where ?? "פריט"}: צריך תמונה או כותרת.`);
  if (code === "cta_without_link") return at(400, `${where ?? "פריט"}: כפתור צריך קישור.`);
  if (code === "image_not_ours") return at(400, `${where ?? "התמונה"}: העלו את התמונה בכפתור ההעלאה.`);
  if (code === "link_invalid") return at(400, `${where ?? "הקישור"}: בחרו מסך מהרשימה או כתובת https מלאה.`);
  if (code === "duplicate_item") return at(400, "שני פריטים עם אותו מזהה. מחקו אחד והוסיפו מחדש.");
  if (code === "roles_empty") return at(400, "בחרו למי להציג.");
  if (code === "test_emails") return at(400, "כתבו 1 עד 5 כתובות מייל של חשבונות ב-bloc.");
  if (code === "shape_source") return at(400, '"מה חדש ב-bloc" מוצג בערימה, ברשימה או בעיגולים.');
  if (code === "invalid" || r.status === 400) return at(400, where ? `${where}: הערך לא תקין.` : "הבקשה לא תקינה. רעננו ונסו שוב.");
  if (code === "sql_missing") return at(503, HS_SQL_MISSING_TEXT);
  if (code === "config_missing") return at(503, "ב-bloc חסרה הגדרה להעלאת תמונות (המפתח הציבורי של Supabase).");
  if (code === "write_failed") return at(503, "לא נשמר. נסו שוב בעוד רגע.");
  if (code === "read_failed") return at(503, "bloc לא הצליח לקרוא כרגע. נסו שוב בעוד רגע.");
  return { status: r.status >= 400 ? r.status : 502, code: code || "failed", error: kind === "action" ? "הפעולה לא הצליחה. נסו שוב." : "הקריאה מ-bloc נכשלה. נסו שוב.", ...(field ? { field } : {}) };
}

// ── הפעולות (POST /api/home-studio) ─────────────────────────────────────────────
const Id = z.string().regex(UUID);
const Version = z.number().int().min(1);
const When = z.union([z.string().max(40), z.null()]);
export const hsActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("card.save"), id: Id.optional(), version: Version.optional(), name: z.string().max(200),
    shape: z.enum(STUDIO_SHAPES), slot: z.enum(STUDIO_SLOTS), position: z.number().int().min(0).max(99), source: z.enum(STUDIO_SOURCES),
    content: z.record(z.unknown()), audience: z.record(z.unknown()), starts_at: When, ends_at: When, frequency: z.enum(STUDIO_FREQUENCIES),
  }).strict(),
  z.object({ action: z.literal("card.duplicate"), id: Id }).strict(),
  z.object({ action: z.literal("card.status"), id: Id, version: Version, status: z.enum(STUDIO_STATUSES), test_emails: z.array(z.string().max(200)).max(5).optional() }).strict(),
  z.object({ action: z.literal("card.stats"), id: Id }).strict(),
  z.object({
    action: z.literal("update.save"), id: Id.optional(), version: Version.optional(), title: z.string().max(200), body: z.string().max(1000),
    image_url: z.union([z.string().max(600), z.null()]), link: z.union([z.record(z.unknown()), z.null()]), roles: z.array(z.enum(["tenant", "vaad"])).max(2),
  }).strict(),
  z.object({ action: z.literal("update.status"), id: Id, version: Version, status: z.enum(UPDATE_STATUSES) }).strict(),
  z.object({ action: z.literal("switch"), enabled: z.boolean() }).strict(),
]);
export type HsAction = z.infer<typeof hsActionSchema>;
/** מה צריך לכל פעולה, ואיזו שורה ביומן הפאנל (קריאה — בלי שורה). */
export const HS_ACTIONS: Record<HsAction["action"], { permission: "home_studio.read" | "home_studio.manage"; audit: string | null; entity: string }> = {
  "card.save":      { permission: "home_studio.manage", audit: "HOME_CARD_SAVE", entity: "home_card" },
  "card.duplicate": { permission: "home_studio.manage", audit: "HOME_CARD_DUPLICATE", entity: "home_card" },
  "card.status":    { permission: "home_studio.manage", audit: "HOME_CARD_STATUS", entity: "home_card" },
  "card.stats":     { permission: "home_studio.read", audit: null, entity: "home_card" },
  "update.save":    { permission: "home_studio.manage", audit: "BLOC_UPDATE_SAVE", entity: "bloc_update" },
  "update.status":  { permission: "home_studio.manage", audit: "BLOC_UPDATE_STATUS", entity: "bloc_update" },
  "switch":         { permission: "home_studio.manage", audit: "HOME_STUDIO_SWITCH", entity: "home_studio" },
};
