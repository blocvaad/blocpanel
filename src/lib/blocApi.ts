// src/lib/blocApi.ts — קריאות פעולה מהפאנל ל-bloc (שרת-לשרת, חתומות).
//
// למה לא לכתוב ישירות ל-DB: פעולות כמו החלפת ראש ועד כוללות עצירת הוראת קבע
// ב-PayPlus, מיילים והתראות. הלוגיקה והמפתחות נשארים ב-bloc; הפאנל שולח בקשה
// חתומה, ו-bloc מריץ את אותו מסלול כמו באפליקציה.
//
// חתימה: HMAC-SHA256(PANEL_ACTION_SECRET, `${timestamp}.${body}`), חלון 5 דקות.
// אותו וקטור בדיקה בשני הריפוזיטוריז (bloc: tests/lib/panelSignature.test.ts).
//
// הגדרה (Vercel של blocpanel): BLOC_APP_URL (הכתובת הסופית, בלי הפניה — למשל
// https://www.blocvaad.co.il) + PANEL_ACTION_SECRET (אותו ערך כמו ב-bloc, 32+ תווים).
import { createHmac } from "crypto";

export const PANEL_SIG_HEADER = "x-bloc-panel-signature";
export const PANEL_TS_HEADER = "x-bloc-panel-timestamp";
const SECRET_MIN = 32;
// Cloudflare (Browser Integrity Check) חוסם UA של כלי שרת מוכרים ("error code: 1010").
// UA מזהה ומפורש — והחתימה היא ההגנה האמיתית.
export const BLOC_USER_AGENT = "blocpanel/1.0 (server-to-server; +https://www.blocvaad.co.il)";
const TIMEOUT_MS = 25_000;

export function signPanelRequest(secret: string, timestampMs: number | string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestampMs}.${rawBody}`).digest("hex");
}

export type BlocConfig = { url: string; secret: string };

export function blocConfig(env: Record<string, string | undefined> = process.env): BlocConfig | null {
  const url = (env.BLOC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const secret = env.PANEL_ACTION_SECRET ?? "";
  const okUrl = /^https:\/\/[^/\s]+$/.test(url) || (env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(url));
  if (!okUrl || secret.length < SECRET_MIN) return null;
  return { url, secret };
}

export type BlocResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function callBloc(
  path: "/api/internal/committee" | "/api/internal/health",
  payload: Record<string, unknown>,
  opts: { config?: BlocConfig | null; fetchImpl?: FetchLike; now?: () => number } = {},
): Promise<BlocResult> {
  const cfg = opts.config === undefined ? blocConfig() : opts.config;
  if (!cfg) return { ok: false, status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר (BLOC_APP_URL / PANEL_ACTION_SECRET ב-Vercel של הפאנל)" };

  const body = JSON.stringify(payload);
  const ts = String((opts.now ?? Date.now)());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${cfg.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json", "user-agent": BLOC_USER_AGENT,
        [PANEL_SIG_HEADER]: signPanelRequest(cfg.secret, ts, body), [PANEL_TS_HEADER]: ts,
      },
      body,
      redirect: "manual",          // POST שהופנה עלול להפוך ל-GET או לאבד את הגוף — עדיף שגיאה ברורה
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return { ok: false, status: 504, code: aborted ? "TIMEOUT" : "NETWORK",
      error: aborted ? "bloc לא ענה בזמן. ייתכן שהפעולה בוצעה — רעננו לפני שמנסים שוב." : "שגיאת רשת מול bloc" };
  } finally {
    clearTimeout(timer);
  }

  if (res.status >= 300 && res.status < 400) {
    return { ok: false, status: 502, code: "REDIRECT", error: `BLOC_APP_URL מפנה ל-${res.headers.get("location") ?? "כתובת אחרת"} — עדכנו לכתובת הסופית` };
  }
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* לא JSON — אולי דף של Cloudflare */ }

  // Cloudflare חסם לפני שהבקשה הגיעה ל-bloc (1010 = Browser Integrity Check, או אתגר בוטים).
  const cfCode = /error code:\s*(\d{4})/i.exec(text)?.[1];
  const fromEdge = (res.headers.get("server") ?? "").toLowerCase() === "cloudflare" && typeof json.error !== "string";
  if (cfCode || (fromEdge && (res.status === 403 || res.status === 503))) {
    return { ok: false, status: 502, code: "EDGE_BLOCKED",
      error: `Cloudflare חסם את הבקשה לפני bloc${cfCode ? ` (error ${cfCode})` : ""} — צריך כלל Skip ל-/api/internal/ (Browser Integrity Check / Bot Fight Mode)` };
  }
  // 404 בלי code = החתימה נדחתה (bloc לא מאשר שה-endpoint קיים). 404 עם code =
  // תשובה עניינית של השירות (למשל "אין בקשה פתוחה").
  if (res.status === 404 && typeof json.code !== "string") {
    return { ok: false, status: 502, code: "REJECTED", error: "bloc דחה את הבקשה (סוד לא תואם, שעון שרת, או שהגרסה עוד לא נפרסה)" };
  }
  if (!res.ok) return { ok: false, status: res.status, code: typeof json.code === "string" ? json.code : undefined, error: typeof json.error === "string" ? json.error : "הפעולה נכשלה ב-bloc" };
  return { ok: true, status: res.status, data: json };
}
