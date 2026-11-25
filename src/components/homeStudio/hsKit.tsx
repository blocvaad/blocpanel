"use client";
// homeStudio/hsKit — חלקים משותפים למסך "מסך הבית" (bloc HOME-STUDIO-1): בקשה ל-/api/home-studio (הצלחה רק עם ok === true; תשובה
// לא ברורה — unclear, ואז רק רענון, בלי "שמירה" שנייה שיוצרת כפילות), העלאת תמונה, וסימן קטן לכל צורה.
import { readAdsAnswer, readUploadAnswer, connectionFailure, UPLOAD_FAILED_TEXT, type AdsResult } from "@/lib/adsUi";
import type { StudioShape } from "@/lib/homeStudio";

export type HsResult<T> = AdsResult<T> & { field?: string };

/** פעולה ב-/api/home-studio. שגיאה — המשפט מהשרת (עם השדה, כשיש); unclear — ייתכן שבוצע. */
export async function postStudio<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<HsResult<T>> {
  try {
    const r = await fetch("/api/home-studio", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    const out = readAdsAnswer<T>(r, j) as HsResult<T>;
    if (!out.ok && j && typeof j === "object" && typeof (j as { field?: unknown }).field === "string") out.field = (j as { field: string }).field;
    return out;
  } catch {
    return connectionFailure();
  }
}

/** העלאת תמונה לכרטיס (FormData) → הכתובת הציבורית (רק עם ok === true). */
export async function uploadStudioImage(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string; code: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/home-studio/upload", { method: "POST", credentials: "include", body: fd });
    const j = await r.json().catch(() => null);
    return readUploadAnswer(r, j);
  } catch {
    return { ok: false, error: UPLOAD_FAILED_TEXT, code: "connection" };
  }
}

/** הסימן של כל צורה (לבורר הצורות ולרשימה): ריבועים קטנים במבנה של הצורה. */
export function ShapeGlyph({ shape, size = 28, color = "#60a5fa" }: { shape: StudioShape; size?: number; color?: string }) {
  const s = size;
  const r = (x: number, y: number, w: number, h: number, rx = 2, o = 1) => <rect x={x} y={y} width={w} height={h} rx={rx} fill={color} opacity={o} />;
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" aria-hidden="true" data-shape-glyph={shape}>
      {shape === "banner" && r(2, 8, 24, 12, 3)}
      {shape === "tile" && <>{r(3, 3, 10, 10)}{r(15, 3, 10, 10)}{r(3, 15, 10, 10)}{r(15, 15, 10, 10)}</>}
      {shape === "circles" && <>{[5, 14, 23].map((cx) => <circle key={cx} cx={cx} cy={14} r={4} fill={color} />)}</>}
      {shape === "carousel" && <>{r(1, 6, 9, 16)}{r(12, 6, 9, 16)}{r(23, 6, 5, 16, 2, 0.5)}</>}
      {shape === "list" && <>{r(3, 4, 22, 5)}{r(3, 11.5, 22, 5)}{r(3, 19, 22, 5)}</>}
      {shape === "deck" && <>{r(7, 3, 16, 20, 3, 0.35)}{r(5, 5, 16, 20, 3, 0.6)}{r(3, 7, 16, 20, 3)}</>}
    </svg>
  );
}

export const sectionTitle: React.CSSProperties = { fontSize: "14.5px", fontWeight: 800, color: "var(--text)" };
export const hintText: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5 };
export const errText: React.CSSProperties = { fontSize: "13px", color: "var(--red)", lineHeight: 1.5 };
