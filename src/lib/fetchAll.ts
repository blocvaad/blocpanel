// src/lib/fetchAll.ts — קריאה מלאה מעבר לתקרת 1000 השורות של PostgREST.
//
// Supabase מחזיר עד max_rows (1000) שורות לבקשה, בלי שגיאה. סכומים וגרפים
// שנבנו מקריאה אחת נחתכו בשקט ברגע שהמערכת גדלה. כאן: דפדוף עם range() עד
// שעמוד חוזר חסר, עם תקרת עמודים כדי שדף לא ייתקע. `truncated` אומר למסך
// שהמספר חלקי — עדיף להגיד מאשר להציג מספר שגוי.

export type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAll<T>(
  page: (from: number, to: number) => PageResult<T>,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<{ rows: T[]; truncated: boolean; error: boolean }> {
  const size = opts.pageSize ?? 1000;
  const maxPages = opts.maxPages ?? 20;
  const rows: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * size, i * size + size - 1);
    if (error) return { rows, truncated: true, error: true };
    const got = data ?? [];
    rows.push(...got);
    if (got.length < size) return { rows, truncated: false, error: false };
  }
  return { rows, truncated: true, error: false };
}
