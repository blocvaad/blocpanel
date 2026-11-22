// src/lib/sla.ts — MOD-1: זמנים בעברית ויעד לבדיקה (SLA) — לתורים של המיתון (דיווחים על הודעות פרטיות, הסטורי).
const HOUR = 3_600_000;

/** משך בעברית: פחות משעה / שעה / שעתיים / 5 שעות / יום / יומיים / 3 ימים. */
export function spanText(ms: number): string {
  const h = Math.floor(Math.max(0, ms) / HOUR);
  if (h < 1) return "פחות משעה";
  if (h < 24) return h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
  const d = Math.floor(h / 24);
  return d === 1 ? "יום" : d === 2 ? "יומיים" : `${d} ימים`;
}

/** "לפני 3 שעות" / "עכשיו"; תאריך לא תקין — ריק. */
export function agoText(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const ms = now - t;
  return ms < 60_000 ? "עכשיו" : `לפני ${spanText(ms)}`;
}

/** כמה זמן נשאר, עם הפועל שמתאים למשך (סקירת MOD-1 #11): נשארה שעה, נשאר יום, נשארו שעתיים / 5 שעות / יומיים. */
export function leftText(ms: number): string {
  const span = spanText(ms);
  if (span === "פחות משעה" || span === "שעה") return `נשארה ${span}`;
  if (span === "יום") return "נשאר יום";
  return `נשארו ${span}`;
}

export type Sla = { level: "ok" | "soon" | "late"; text: string };
/** היעד: hours מהרגע שדווח. "בקרוב" — אחרי חצי מהזמן; "באיחור" — אחרי כולו. */
export function slaOf(hours: number, createdAt: string, now: number): Sla | null {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return null;
  const left = t + hours * HOUR - now;
  if (left <= 0) return { level: "late", text: `באיחור של ${spanText(-left)}` };
  return { level: left <= (hours * HOUR) / 2 ? "soon" : "ok", text: leftText(left) };
}

/** כמה זמן עבר (במילישניות) מאז; תאריך לא תקין — 0. */
export function ageMs(iso: string, now: number): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, now - t) : 0;
}
