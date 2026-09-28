// src/lib/committee.ts — המשכיות ועד (bloc 133/134), לתצוגה ולהחלטות בפאנל.
// טהור: בלי DB ובלי רשת — משמש גם את ה-API וגם את הדף.

export type SuccessionReason = "deceased" | "unavailable" | "other";
export type SuccessionStatus = "pending" | "cancelled" | "executed";

export const REASON_LABEL: Record<SuccessionReason, string> = {
  deceased: "נפטר/ה",
  unavailable: "לא זמין/ה לאורך זמן",
  other: "סיבה אחרת",
};
export const CANCEL_KIND_LABEL: Record<string, string> = {
  head_present: "ראש הוועד לחץ \"אני כאן\"",
  withdrawn: "המבקש ביטל",
  panel: "בוטל ע\"י צוות bloc",
};
export const EXEC_MODE_LABEL: Record<string, string> = {
  auto: "אוטומטית אחרי 72 שעות",
  panel: "ביצוע מיידי ע\"י צוות bloc",
};

/** הארכת מועד ההעברה — עד 30 יום מיום ההחלפה (נאכף גם ב-DB, 134). */
export const HANDOVER_EXTEND_MAX_DAYS = 30;
const DAY = 86_400_000;

// ── זמן לפי שעון ישראל ──────────────────────────────────────────────────────

function ilParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { key: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")), minute: Number(g("minute")) };
}

/** 23:59:59 שעון ישראל של היום שבו `d` נופל + `addDays` ימים. */
export function ilEndOfDay(d: Date, addDays = 0): Date {
  const key = ilParts(new Date(d.getTime() + addDays * DAY)).key;
  const [y, m, day] = key.split("-").map(Number);
  for (const off of [3, 2]) {
    const t = new Date(Date.UTC(y, m - 1, day, 23, 59, 59) - off * 3_600_000);
    const p = ilParts(t);
    if (p.key === key && p.hour === 23 && p.minute === 59) return t;
  }
  return new Date(Date.UTC(y, m - 1, day, 21, 59, 59));
}

export function ilDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = ilParts(new Date(iso)).key.split("-");
  return `${d}/${m}/${y}`;
}

export function ilDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = ilParts(new Date(iso));
  const [y, m, d] = p.key.split("-");
  return `${d}/${m}/${y} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "בעוד 2 ימים ו-5 שעות" / "בעוד 40 דקות" / "הגיע המועד". */
export function countdown(iso: string, now: number = Date.now()): { text: string; due: boolean; urgent: boolean } {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return { text: "הגיע המועד", due: true, urgent: true };
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const urgent = ms < 12 * 3_600_000;
  if (days > 0) return { text: `בעוד ${days === 1 ? "יום" : `${days} ימים`}${hours ? ` ו-${hours} שעות` : ""}`, due: false, urgent };
  if (hours > 0) return { text: `בעוד ${hours === 1 ? "שעה" : `${hours} שעות`}`, due: false, urgent };
  return { text: `בעוד ${Math.max(1, mins)} דקות`, due: false, urgent };
}

/**
 * אפשרויות הארכה: 3 / 7 / 14 ימים מהמועד הנוכחי (סוף היום), עד 30 יום מההחלפה.
 * המועד הנוכחי כבר עבר → הספירה מהיום.
 */
export function extendOptions(p: { executedAt: string; deadline: string; now?: number }): { days: number; until: string }[] {
  const now = p.now ?? Date.now();
  const cap = new Date(p.executedAt).getTime() + HANDOVER_EXTEND_MAX_DAYS * DAY;
  const from = new Date(Math.max(new Date(p.deadline).getTime(), now));
  const out: { days: number; until: string }[] = [];
  for (const days of [3, 7, 14]) {
    const until = ilEndOfDay(from, days);
    if (until.getTime() <= cap && until.getTime() > new Date(p.deadline).getTime()) out.push({ days, until: until.toISOString() });
  }
  return out;
}

// ── סיכון: בניינים שאם ראש הוועד ייעלם, אף אחד בבניין לא יוכל לפעול ─────────

export type RiskLevel = "orphan" | "single_no_deputy";
export const RISK_LABEL: Record<RiskLevel, string> = {
  orphan: "אין ועד פעיל",
  single_no_deputy: "ועד יחיד בלי ממלא מקום",
};

export type RiskInput = {
  buildings: { id: string; name: string; founder_id: string | null; is_archived?: boolean | null; is_active?: boolean | null }[];
  admins: { building_id: string; user_id: string }[];        // building_memberships: role=admin, status=active
  deputies: { building_id: string; user_id: string; status: string }[];
  members?: { building_id: string }[];                        // building_memberships: status=active (לספירת דיירים)
};

export type RiskRow = { id: string; name: string; level: RiskLevel; founder_id: string | null; admins: number; members: number };

export function riskRows(input: RiskInput): RiskRow[] {
  const admins = new Map<string, number>();
  for (const a of input.admins) admins.set(a.building_id, (admins.get(a.building_id) ?? 0) + 1);
  const members = new Map<string, number>();
  for (const m of input.members ?? []) members.set(m.building_id, (members.get(m.building_id) ?? 0) + 1);
  const activeDeputy = new Set(input.deputies.filter((d) => d.status === "active").map((d) => d.building_id));

  const rows: RiskRow[] = [];
  for (const b of input.buildings) {
    if (b.is_archived) continue;
    const n = admins.get(b.id) ?? 0;
    const m = members.get(b.id) ?? 0;
    if (n === 0 && m > 0) rows.push({ id: b.id, name: b.name, level: "orphan", founder_id: b.founder_id, admins: 0, members: m });
    else if (n === 1 && !activeDeputy.has(b.id)) rows.push({ id: b.id, name: b.name, level: "single_no_deputy", founder_id: b.founder_id, admins: 1, members: m });
  }
  const rank: Record<RiskLevel, number> = { orphan: 0, single_no_deputy: 1 };
  return rows.sort((a, b) => rank[a.level] - rank[b.level] || b.members - a.members || a.name.localeCompare(b.name, "he"));
}

// ── התראות הפאנל → קישור ─────────────────────────────────────────────────────

export function notificationLink(n: { type: string; entity_type: string | null; entity_id: string | null }): string | null {
  if (!n.entity_type || !n.entity_id) return null;
  if (n.type.startsWith("committee_") && n.entity_type === "building") return `/committee?building=${encodeURIComponent(n.entity_id)}`;
  if (n.entity_type === "building") return `/buildings/${encodeURIComponent(n.entity_id)}`;
  return `/${n.entity_type}/${n.entity_id}`;
}

export const COMMITTEE_ALERT_ICON: Record<string, string> = {
  committee_succession_requested: "👥",
  committee_succession_disputed: "⚠️",
  committee_recurring_not_stopped: "🛑",
  committee_recurring_unknown: "❓",
};
