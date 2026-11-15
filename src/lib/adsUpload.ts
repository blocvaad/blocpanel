// src/lib/adsUpload.ts — שליחת תמונת פרסומת לכתובת החתומה ש-bloc נתן (PANEL-PAY א2ב, החלטה 372). שרת.
//
// bloc בודק סוג וגודל ויוצר כתובת העלאה חתומה לנתיב אחד בבאקט 'ads' (createSignedUploadUrl). הפאנל שולח אליה את הבייטים
// ב-PUT — בלי מפתח service role ובלי לקוח supabase: הטוקן שבכתובת הוא ההרשאה, והגבולות של הבאקט (SQL 175: סוג, 2MB) חלים.
// אותן כותרות שה-SDK שלח כשהפאנל העלה בעצמו: content-type, cache-control לשנה, x-upsert=false (לא דורסים קובץ קיים).

export const PUT_TIMEOUT_MS = 25_000;
export const AD_IMAGE_CACHE = "max-age=31536000";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type PutResult = { ok: true } | { ok: false; status: number; code: "put_rejected" | "put_timeout" | "put_network" };

/** PUT של הבייטים לכתובת החתומה. 2xx = נשמר; כל השאר — לא נשמר (הכתובת עם הטוקן לא נרשמת בשום מקום). */
export async function putSignedImage(
  signedUrl: string, body: ArrayBuffer, type: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; anonKey?: string | null } = {},
): Promise<PutResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? PUT_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(signedUrl, {
      method: "PUT",
      headers: {
        "content-type": type, "cache-control": AD_IMAGE_CACHE, "x-upsert": "false",
        // המפתח הציבורי של bloc (C4) — כמו supabase-js uploadToSignedUrl, כדי שהשער של Supabase לא ידחה. לא סוד.
        ...(opts.anonKey ? { apikey: opts.anonKey, authorization: `Bearer ${opts.anonKey}` } : {}),
      },
      body,
      redirect: "manual",
      signal: ctrl.signal,
      cache: "no-store",
    });
    await res.text().catch(() => "");   // לסגור את החיבור; התוכן לא נדרש
    return res.ok ? { ok: true } : { ok: false, status: res.status, code: "put_rejected" };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return { ok: false, status: aborted ? 504 : 502, code: aborted ? "put_timeout" : "put_network" };
  } finally {
    clearTimeout(timer);
  }
}
