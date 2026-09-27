// src/lib/csv.ts — קובץ CSV בטוח לאקסל.
//
// עד עכשיו הייצוא עטף כל ערך ב-"..." בלי לברוח מרכאות (שם עם " שבר עמודות),
// ושם דייר שמתחיל ב-= / + / - / @ נפתח באקסל כנוסחה (CSV injection).

export type CsvValue = string | number | null | undefined;

/** תא אחד: מרכאות כפולות לפי RFC-4180, ונטרול נוסחאות בשדות טקסט. */
export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** BOM בהתחלה כדי שאקסל יזהה UTF-8 (עברית). */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
