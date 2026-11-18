// src/lib/months.ts — א3-1 (bloc): החודשים ש-bloc מחזיר ('YYYY-MM', שעון ישראל) → התוויות שהגרפים מציגים.

/** 'YYYY-MM' → "נוב׳ 26" (כמו שהגרפים הציגו עד עכשיו). אמצע החודש — בלי קפיצה של אזור זמן. */
export function heMonthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("he-IL", { month: "short", year: "2-digit", timeZone: "Asia/Jerusalem" });
}
/** [{ month, value }] (בסדר כרונולוגי) → { "נוב׳ 26": value } בסדר הזה — הצורה שהגרפים מקבלים. */
export function byHeMonth<T extends { month: string }>(rows: T[], value: (r: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of [...rows].sort((a, b) => a.month.localeCompare(b.month))) out[heMonthLabel(r.month)] = (out[heMonthLabel(r.month)] ?? 0) + value(r);
  return out;
}
