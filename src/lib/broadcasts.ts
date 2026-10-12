// src/lib/broadcasts.ts — הודעות של צוות bloc לבניינים (bloc UI-R5a). טהור: בלי DB ובלי רשת —
// משמש את ה-API (/api/broadcast) ואת המסך.
//
// השליחה, ההורדה, העריכה והמחיקה — ב-bloc (/api/internal/broadcast, חתום). כאן:
//   • העדיפויות — אותן מילים כמו באפליקציה (דחוף / חשוב / רגיל / לידיעה). קודם הפאנל קרא ל-low "רגיל"
//     ול-normal "חשוב", כך ש"חשוב" בפאנל הגיע לדיירים כ"רגיל".
//   • כמה זמן מוצגת — ברירת המחדל שבוע (קודם: "קבוע", בלי שום דרך להוריד). "עד תאריך" — סוף היום בישראל.
//   • קיבוץ השורות לשידורים: שידור חדש — לפי המזהה שב-dedupe_key (panel:<מזהה>:<בניין>); שידור מלפני
//     UI-R5a (בלי dedupe_key) — אותה כותרת, עדיפות ותאריך סיום, שנשלחו ברצף (עד 15 דקות בין שורה לשורה).
import { ilDateTime, ilEndOfDay } from "./committee";

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── עדיפות ──────────────────────────────────────────────────────────────────

export type Priority = "urgent" | "high" | "normal" | "low";
export const PRIORITIES: ReadonlyArray<{ key: Priority; label: string; hint: string; color: string }> = [
  { key: "urgent", label: "דחוף", hint: "התראה גם בלילה", color: "#ef4444" },
  { key: "high", label: "חשוב", hint: "מסומנת כחשובה", color: "#f97316" },
  { key: "normal", label: "רגיל", hint: "הודעה רגילה", color: "#3b82f6" },
  { key: "low", label: "לידיעה", hint: "בלי הדגשה", color: "#a1a1aa" },
];
const BY_KEY = new Map(PRIORITIES.map((p) => [p.key, p]));
export const priorityOf = (v: unknown): Priority => (typeof v === "string" && BY_KEY.has(v as Priority) ? (v as Priority) : "normal");
export const priorityLabel = (v: unknown): string => BY_KEY.get(priorityOf(v))!.label;
export const priorityColor = (v: unknown): string => BY_KEY.get(priorityOf(v))!.color;

// ── כמה זמן מוצגת ───────────────────────────────────────────────────────────

export type DurationKey = "1d" | "3d" | "1w" | "2w" | "1m" | "date" | "none";
export const DURATIONS: ReadonlyArray<{ key: DurationKey; label: string }> = [
  { key: "1d", label: "24 שעות" },
  { key: "3d", label: "3 ימים" },
  { key: "1w", label: "שבוע" },
  { key: "2w", label: "שבועיים" },
  { key: "1m", label: "חודש" },
  { key: "date", label: "עד תאריך" },
  { key: "none", label: "בלי סיום" },
];
export const DURATION_KEYS = DURATIONS.map((d) => d.key) as [DurationKey, ...DurationKey[]];
export const DEFAULT_DURATION: DurationKey = "1w";
/** הכי רחוק שאפשר (כמו ב-bloc). */
export const MAX_DAYS = 365;
const SPAN: Record<"1d" | "3d" | "1w" | "2w" | "1m", number> = { "1d": 1, "3d": 3, "1w": 7, "2w": 14, "1m": 30 };

/** היום בישראל, YYYY-MM-DD. */
export function ilTodayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** YYYY-MM-DD + ימים. */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** YYYY-MM-DD של תאריך אמיתי (לא 31/02). */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * מתי ההודעה יורדת: ISO; null — בלי סיום; undefined — תאריך לא תקין, שכבר עבר, או רחוק מ-MAX_DAYS.
 * "עד תאריך" — 23:59 בישראל של אותו יום.
 */
export function expiryFor(key: DurationKey, dateKey?: string | null, now: Date = new Date()): string | null | undefined {
  if (key === "none") return null;
  if (key === "date") {
    if (!isDateKey(dateKey)) return undefined;
    const [y, m, d] = dateKey.split("-").map(Number);
    const end = ilEndOfDay(new Date(Date.UTC(y, m - 1, d, 9)));
    return expiryProblem(end.toISOString(), now) ? undefined : end.toISOString();
  }
  return new Date(now.getTime() + SPAN[key] * DAY).toISOString();
}

/** null — תאריך סיום תקין (או בלי סיום); אחרת — מה לא בסדר, בעברית. */
export function expiryProblem(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "תאריך הסיום לא תקין";
  if (t <= now.getTime()) return "תאריך הסיום כבר עבר";
  if (t > now.getTime() + (MAX_DAYS + 1) * DAY) return `אפשר להציג הודעה עד ${MAX_DAYS} ימים`;
  return null;
}

/** מתי היא יורדת, במילים. */
export function expiryText(expiresAt: string | null | undefined, now: Date = new Date()): string {
  if (!expiresAt) return "בלי תאריך סיום";
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return "";
  return t <= now.getTime() ? `הסתיימה ב-${ilDateTime(expiresAt)}` : `בתוקף עד ${ilDateTime(expiresAt)}`;
}

/** בקצרה, לשדה "תוקף": "עד …" / "הסתיימה …" / "בלי תאריך סיום". */
export function expiryShort(expiresAt: string | null | undefined, now: Date = new Date()): string {
  if (!expiresAt) return "בלי תאריך סיום";
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return "";
  return t <= now.getTime() ? `הסתיימה ${ilDateTime(expiresAt)}` : `עד ${ilDateTime(expiresAt)}`;
}

/** מקום למלא בתבנית — לא נשלח (גם bloc בודק). */
export const BLANK = "___";
export const hasBlanks = (...texts: Array<string | null | undefined>) => texts.some((t) => (t ?? "").includes(BLANK));

// ── קיבוץ לשידורים ──────────────────────────────────────────────────────────

export const PANEL_PREFIX = "panel:";
/** שידור ישן: יותר מזה בין שורה לשורה — שידור אחר. */
export const LEGACY_GAP_MS = 15 * 60_000;

export interface BroadcastRow {
  id: string;
  building_id: string;
  title: string;
  priority: string | null;
  is_pinned: boolean | null;
  requires_ack?: boolean | null;
  expires_at: string | null;
  created_at: string;
  dedupe_key: string | null;
}

export type BroadcastState = "active" | "ended" | "partial";

export interface BroadcastGroup {
  /** "panel:<מזהה>" / "legacy:<השורה הראשונה>". */
  key: string;
  broadcastId: string | null;
  legacy: boolean;
  ids: string[];
  buildingIds: string[];
  /** השורה שממנה לוקחים את התוכן. */
  rep: string;
  title: string;
  priority: Priority;
  isPinned: boolean;
  requiresAck: boolean;
  expiresAt: string | null;
  createdAt: string;
  total: number;
  active: number;
  state: BroadcastState;
  /** לכל בניין — האם ההודעה עוד מוצגת שם. */
  activeByBuilding: Record<string, boolean>;
}

/** panel:<מזהה>:<בניין> → החלקים; כל דבר אחר → null. */
export function panelKeyParts(key: string | null | undefined): { broadcastId: string; buildingId: string } | null {
  if (!key || !key.startsWith(PANEL_PREFIX)) return null;
  const [, broadcastId, buildingId] = key.split(":");
  return UUID.test(broadcastId ?? "") && UUID.test(buildingId ?? "") ? { broadcastId, buildingId } : null;
}

const isOn = (r: { expires_at: string | null }, now: number) => !r.expires_at || !(new Date(r.expires_at).getTime() <= now);

export function groupBroadcasts(rows: readonly BroadcastRow[], now: number = Date.now()): BroadcastGroup[] {
  const buckets = new Map<string, { broadcastId: string | null; rows: BroadcastRow[] }>();
  const put = (key: string, broadcastId: string | null, r: BroadcastRow) => {
    const b = buckets.get(key) ?? { broadcastId, rows: [] };
    b.rows.push(r);
    buckets.set(key, b);
  };

  const legacy: BroadcastRow[] = [];
  for (const r of rows) {
    const p = panelKeyParts(r.dedupe_key);
    if (p) put(`panel:${p.broadcastId}`, p.broadcastId, r);
    else if (!r.dedupe_key) legacy.push(r);
  }
  const ts = (r: BroadcastRow) => new Date(r.created_at).getTime();
  legacy.sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id));
  const open = new Map<string, { key: string; last: number }>();
  for (const r of legacy) {
    const sig = `${r.title}\u0000${r.priority ?? ""}\u0000${r.expires_at ? new Date(r.expires_at).getTime() : ""}`;
    const t = ts(r);
    const cur = open.get(sig);
    if (cur && t - cur.last <= LEGACY_GAP_MS) {
      put(cur.key, null, r);
      cur.last = t;
    } else {
      const key = `legacy:${r.id}`;
      open.set(sig, { key, last: t });
      put(key, null, r);
    }
  }

  const out: BroadcastGroup[] = [];
  for (const [key, { broadcastId, rows: list }] of buckets) {
    const sorted = [...list].sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id));
    const first = sorted[0];
    const on = sorted.filter((r) => isOn(r, now));
    const ends = (on.length ? on : sorted).map((r) => r.expires_at);
    const expiresAt = ends.some((e) => !e) ? null : ends.reduce<string | null>((m, e) => (!m || new Date(e!).getTime() > new Date(m).getTime() ? e : m), null);
    const activeByBuilding: Record<string, boolean> = {};
    for (const r of sorted) activeByBuilding[r.building_id] = activeByBuilding[r.building_id] || isOn(r, now);
    out.push({
      key, broadcastId, legacy: !broadcastId,
      ids: sorted.map((r) => r.id),
      buildingIds: [...new Set(sorted.map((r) => r.building_id))],
      rep: first.id,
      title: first.title,
      priority: priorityOf(first.priority),
      isPinned: !!first.is_pinned,
      requiresAck: !!first.requires_ack,
      expiresAt,
      createdAt: first.created_at,
      total: sorted.length,
      active: on.length,
      state: on.length === sorted.length ? "active" : on.length === 0 ? "ended" : "partial",
      activeByBuilding,
    });
  }
  return out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.key.localeCompare(b.key));
}

/**
 * כשהקריאה נחתכה (יותר שורות ממה שנקרא): שידור שהשורות שלו קרובות לנקודת החיתוך אולי חלקי — המספרים שלו
 * שגויים, ובשידור ישן גם הפעולות יגעו רק בחלק. מה שנשאר — רק שידורים שכולם בתוך מה שנקרא.
 */
export function completeGroups(groups: BroadcastGroup[], oldestFetched: string | null, marginMs: number): BroadcastGroup[] {
  if (!oldestFetched) return groups;
  const cut = new Date(oldestFetched).getTime();
  return groups.filter((g) => new Date(g.createdAt).getTime() > cut + marginMs);
}

/** "ל-3 בניינים" / "לבניין אחד". */
export function buildingsText(n: number): string {
  return n === 1 ? "לבניין אחד" : `ל-${n} בניינים`;
}

/** אחרי שליחה: כמה קיבלו, כמה לא, מה נשאר, ומה דולג (מושעה / בארכיון). */
export function sendOutcomeText(r: { title: string; delivered: number; failed: number; remaining: number; skipped: number }): string {
  const parts = [r.delivered ? `"${r.title}" נשלחה ${buildingsText(r.delivered)}.` : `"${r.title}" עוד לא נשלחה.`];
  if (r.failed) parts.push(`לא הגיעה ${buildingsText(r.failed)}.`);
  if (r.remaining) parts.push(`השליחה עוד לא הסתיימה: ${r.remaining === 1 ? "נשאר בניין אחד" : `נשארו ${r.remaining} בניינים`}.`);
  if (r.skipped) parts.push(r.skipped === 1 ? "בניין אחד שנבחר מושעה או בארכיון, ולא קיבל אותה." : `${r.skipped} בניינים שנבחרו מושעים או בארכיון, ולא קיבלו אותה.`);
  return parts.join(" ");
}

/**
 * כמה דיירים ראו / אישרו, בעברית תקינה (כמו ב-bloc): "12 מתוך 30 דיירים ראו", "דייר אחד מתוך 30 אישר",
 * "עוד אף דייר לא ראה (מתוך 30)". בלי מספר הדיירים (או כשראו יותר — מי שעזב את הבניין) — בלי "מתוך".
 */
export function readersText(n: number, members: number | null, ack: boolean): string {
  const one = ack ? "אישר" : "ראה";
  const many = ack ? "אישרו" : "ראו";
  if (members === null || n > members) return n === 1 ? `דייר אחד ${one}` : `${n} דיירים ${many}`;
  if (n === 0) return `עוד אף דייר לא ${one} (מתוך ${members})`;
  if (n === 1) return `דייר אחד מתוך ${members} ${one}`;
  return `${n} מתוך ${members} דיירים ${many}`;
}

/** "ב-3 בניינים" / "בבניין אחד". */
export function inBuildingsText(n: number): string {
  return n === 1 ? "בבניין אחד" : `ב-${n} בניינים`;
}
