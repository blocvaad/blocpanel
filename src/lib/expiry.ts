// Single source of truth for announcement / broadcast expiry math.
// Used by both the broadcast API route and BroadcastForm so the
// hours/days/weeks/months → expires_at conversion can never drift
// between client and server.

export type DurationUnit = "hours" | "days" | "weeks" | "months";

// A "month" here is a fixed 30-day window on purpose: expiry is a
// display-lifetime, not a calendar date, so callers get predictable,
// timezone-independent behaviour. Keep in sync with the product app.
export const UNIT_TO_DAYS: Record<DurationUnit, number> = {
  hours:  1 / 24,
  days:   1,
  weeks:  7,
  months: 30,
};

/** Convert a free-choice number + unit into a day count (may be fractional). */
export function toDays(num: number, unit: DurationUnit): number {
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num * UNIT_TO_DAYS[unit];
}

/**
 * Resolve an absolute expiry timestamp from a day count.
 * 0 / negative / non-finite → null, meaning "permanent, never expires".
 * `now` is injectable so the conversion is deterministic under test.
 */
export function resolveExpiresAt(
  expiresInDays: number | null | undefined,
  now: number = Date.now()
): string | null {
  if (expiresInDays == null) return null;
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) return null;
  return new Date(now + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Compute the effective day count a form should send, given either a
 * preset chip value or an open custom (number + unit) selection.
 */
export function effectiveDurationDays(opts: {
  customOpen: boolean;
  customNum: string | number;
  customUnit: DurationUnit;
  presetDays: number;
}): number {
  const { customOpen, customNum, customUnit, presetDays } = opts;
  if (!customOpen) return presetDays;
  const n = typeof customNum === "string" ? parseFloat(customNum) : customNum;
  return Math.max(0, toDays(n || 0, customUnit));
}
