// src/lib/dmMediaClient.ts — MOD-1 (bloc החלטה 520): פתיחה של קובץ שדווח, בדפדפן של איש הצוות בלבד. מבקשים מהפאנל (נרשם ביומן)
// כתובת חתומה לקובץ המוצפן ואת המפתח שלו; מורידים את המוצפן ישירות מ-Supabase (לא דרך השרת — בלי מגבלת הגודל של Vercel);
// פותחים ב-AES-GCM עם ה-AAD של bloc (`bloc-dm-file-v1|<id>` — lib/dm/crypto fileAad: קובץ שהוחלף לא נפתח); ובונים blob רק עם
// סוג בטוח (תמונה / סרטון / הקלטה). ה-blob — רק בזיכרון של הדף, ומשוחרר כשסוגרים.
import { safeMime, type DmMediaKind } from "@/lib/dmReports";

const enc = new TextEncoder();
export const fileAad = (mediaId: string) => enc.encode(`bloc-dm-file-v1|${mediaId}`);

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** פותח את המוצפן. זורק אם משהו לא תואם (מפתח אחר, קובץ שהוחלף, AAD אחר). מחזיר את ה-ArrayBuffer עצמו (בלי עותק נוסף). */
export async function decryptDmFile(o: { data: ArrayBuffer; key: string; iv: string; mediaId: string }): Promise<ArrayBuffer> {
  const s = globalThis.crypto.subtle;
  const key = await s.importKey("raw", ab(fromB64(o.key)), { name: "AES-GCM" }, false, ["decrypt"]);
  return s.decrypt({ name: "AES-GCM", iv: ab(fromB64(o.iv)), additionalData: ab(fileAad(o.mediaId)) }, key, o.data);
}

export type OpenedMedia = { ok: true; url: string; kind: DmMediaKind; mime: string } | { ok: false; error: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MEDIA_OPEN_FAILED = "הקובץ לא נפתח. נסו שוב.";
export const MEDIA_BROKEN = "הקובץ שהתקבל לא תואם למפתח שבדיווח, ולכן הוא לא מוצג.";
export const MEDIA_GONE = "הקובץ כבר לא שמור: הוא נמחק מהשיחה, או שעבר זמן השמירה.";
export const MEDIA_LINK_EXPIRED = "הקישור לקובץ פג לפני שההורדה התחילה. נסו לפתוח שוב.";

export async function openReportedMedia(reportId: string, mediaId: string, o: { fetchImpl?: FetchLike; makeUrl?: (b: Blob) => string; signal?: AbortSignal } = {}): Promise<OpenedMedia> {
  const f = o.fetchImpl ?? fetch;
  let meta: Record<string, unknown> | null = null;
  try {
    const r = await f("/api/dm-reports/media", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: reportId, media_id: mediaId }), signal: o.signal });
    meta = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!r.ok || meta?.ok !== true) return { ok: false, error: typeof meta?.error === "string" ? meta.error : MEDIA_OPEN_FAILED };
  } catch {
    return { ok: false, error: "אין חיבור. נסו שוב." };
  }
  const kind = meta.kind as DmMediaKind;
  const mime = safeMime(kind, typeof meta.mime === "string" ? meta.mime : null);
  if (!mime || typeof meta.url !== "string" || typeof meta.key !== "string" || typeof meta.iv !== "string") return { ok: false, error: MEDIA_OPEN_FAILED };
  let data: ArrayBuffer;
  try {
    const r = await f(meta.url, { cache: "no-store", credentials: "omit", signal: o.signal });
    if (r.status === 404) return { ok: false, error: MEDIA_GONE };
    if (r.status === 400 || r.status === 403) return { ok: false, error: MEDIA_LINK_EXPIRED };
    if (!r.ok) return { ok: false, error: MEDIA_OPEN_FAILED };
    data = await r.arrayBuffer();
  } catch {
    return { ok: false, error: MEDIA_OPEN_FAILED };
  }
  let plain: ArrayBuffer;
  try { plain = await decryptDmFile({ data, key: meta.key, iv: meta.iv, mediaId }); } catch { return { ok: false, error: MEDIA_BROKEN }; }
  const blob = new Blob([plain], { type: mime });
  return { ok: true, url: (o.makeUrl ?? ((b: Blob) => URL.createObjectURL(b)))(blob), kind, mime };
}
