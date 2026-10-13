// src/lib/blocApi.ts — קריאות פעולה מהפאנל ל-bloc (שרת-לשרת, חתומות).
//
// למה לא לכתוב ישירות ל-DB: פעולות כמו החלפת ראש ועד כוללות עצירת הוראת קבע
// ב-PayPlus, מיילים והתראות. הלוגיקה והמפתחות נשארים ב-bloc; הפאנל שולח בקשה
// חתומה, ו-bloc מריץ את אותו מסלול כמו באפליקציה.
//
// חתימה: HMAC-SHA256(PANEL_ACTION_SECRET, `${timestamp}.${body}`), חלון 5 דקות.
// אותו וקטור בדיקה בשני הריפוזיטוריז (bloc: tests/lib/panelSignature.test.ts).
//
// הגדרה (Vercel של blocpanel): BLOC_APP_URL (הכתובת הסופית, בלי הפניה) + PANEL_ACTION_SECRET (אותו ערך כמו
// ב-bloc, 32+ תווים).
//
// UI-R5c-1: מומלץ BLOC_APP_URL = כתובת ה-vercel.app של bloc (ב-Vercel של bloc: Settings, Domains), ולא
// www.blocvaad.co.il. הדומיין עובר דרך Cloudflare, ו-Bot Fight Mode חוסם בקשות משרתי ענן — בחבילה החינמית
// כלל Skip לא עוקף אותו. מחיקת הודעה מהפאנל נחסמה כך. ההגנה על הערוץ היא החתימה, לא Cloudflare.
// אם כתובת ה-vercel.app מוגנת (Vercel Deployment Protection) — BLOC_PROTECTION_BYPASS: המפתח מ-Vercel → bloc →
// Settings → Deployment Protection → Protection Bypass for Automation. נשלח בכותרת, לא נרשם ביומן.
import { createHmac } from "crypto";
import { PANEL_SESSION_CODE } from "./panelSession";

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

export type BlocConfig = { url: string; secret: string; bypass?: string };

export function blocConfig(env: Record<string, string | undefined> = process.env): BlocConfig | null {
  const url = (env.BLOC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const secret = env.PANEL_ACTION_SECRET ?? "";
  const okUrl = /^https:\/\/[^/\s]+$/.test(url) || (env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(url));
  if (!okUrl || secret.length < SECRET_MIN) return null;
  const bypass = (env.BLOC_PROTECTION_BYPASS ?? "").trim();
  return bypass ? { url, secret, bypass } : { url, secret };
}

/** ההנחיה כש-Cloudflare חוסם: לפנות ל-bloc ישירות דרך Vercel (שם החתימה היא ההגנה). */
export const EDGE_FIX = "הפתרון: ב-Vercel של הפאנל, BLOC_APP_URL = כתובת ה-vercel.app של bloc (ב-Vercel של bloc: Settings, ואז Domains), ואז Redeploy לפאנל.";

/** איפה מוצאים את הכתובת הנכונה. */
const DOMAIN_HINT = "ב-Vercel של bloc: Settings, ואז Domains, הכתובת שמסתיימת ב-vercel.app";

/** המארח של כתובת, באותיות קטנות (בלי פרוטוקול ונתיב). */
export function hostOf(url: string): string {
  const u = url.trim();
  try { return new URL(u.includes("://") ? u : `https://${u}`).host; }   // ה-parser מנרמל לאותיות קטנות
  catch { return u.toLowerCase(); }
}

/**
 * הכתובות של הפאנל עצמו (משתני המערכת של Vercel). BLOC_APP_URL שמצביע לאחת מהן — הפאנל פונה לעצמו, והתשובה
 * היא 401 של הפאנל ("אין התחברות"), לא של bloc.
 */
export function panelHosts(env: Record<string, string | undefined> = process.env): string[] {
  return [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((v): v is string => !!v?.trim()).map(hostOf);
}

// כתובת בתוך משפט בעברית — מבודדת (FSI / PDI), כדי שהסוגריים והנקודה לא יקפצו לצד הלא נכון.
const ltr = (s: string) => `\u2068${s}\u2069`;

const selfUrlError = (host: string) =>
  `BLOC_APP_URL מצביע על הפאנל עצמו (${ltr(host)}), לא על bloc. ב-Vercel של הפאנל שימו בו את הכתובת של bloc (${DOMAIN_HINT}), ואז Redeploy לפאנל.`;

export type BlocResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: string };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function callBloc(
  path: "/api/internal/committee" | "/api/internal/health" | "/api/internal/broadcast" | "/api/internal/members",
  payload: Record<string, unknown>,
  opts: { config?: BlocConfig | null; fetchImpl?: FetchLike; now?: () => number; selfHosts?: string[] } = {},
): Promise<BlocResult> {
  const cfg = opts.config === undefined ? blocConfig() : opts.config;
  if (!cfg) return { ok: false, status: 503, code: "NOT_CONFIGURED", error: "החיבור ל-bloc לא מוגדר (BLOC_APP_URL / PANEL_ACTION_SECRET ב-Vercel של הפאנל)" };
  const host = hostOf(cfg.url);
  if ((opts.selfHosts ?? panelHosts()).includes(host)) return { ok: false, status: 503, code: "SELF_URL", error: selfUrlError(host) };

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
        ...(cfg.bypass ? { "x-vercel-protection-bypass": cfg.bypass } : {}),
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
      error: `Cloudflare חסם את הבקשה לפני שהגיעה ל-bloc${cfCode ? ` (error ${cfCode})` : ""}. ${EDGE_FIX}` };
  }
  // Vercel Deployment Protection על כתובת ה-vercel.app — הבקשה לא הגיעה לקוד של bloc.
  const vercelGate = res.status === 401 && typeof json.error !== "string"
    && ((res.headers.get("server") ?? "").toLowerCase() === "vercel" || /vercel/i.test(text));
  if (vercelGate) {
    return { ok: false, status: 502, code: "ORIGIN_PROTECTED",
      error: "כתובת ה-vercel.app של bloc מוגנת ב-Vercel Deployment Protection. ב-Vercel של bloc: Settings, Deployment Protection, Protection Bypass for Automation. את המפתח שמים בפאנל ב-BLOC_PROTECTION_BYPASS, ואז Redeploy לפאנל." };
  }
  // 401 מעבר לחיבור הוא לא "ההתחברות שלך לפאנל הסתיימה" — לא מעבירים אותו לדפדפן כ-401, ואומרים מה הוא.
  // הערוץ של הפאנל לא מחזיר 401 אף פעם (חתימה שגויה = 404), אז 401 אומר שהבקשה הגיעה למקום הלא נכון.
  if (res.status === 401) {
    if (json.code === PANEL_SESSION_CODE) return { ok: false, status: 502, code: "SELF_URL", error: selfUrlError(host) };
    if (json.code === "NO_SESSION") {
      // ה-proxy של bloc: הנתיב לא פתוח לשרתים בגרסה שרצה בכתובת הזו.
      return { ok: false, status: 502, code: "OLD_BLOC",
        error: `הבקשה הגיעה ל-${ltr(host)}, אבל הגרסה של bloc שרצה שם לא מכירה את הפעולה הזו (פריסה ישנה, או פרויקט אחר). ב-BLOC_APP_URL צריך את הכתובת הקבועה של bloc (${DOMAIN_HINT}), ואז Redeploy לפאנל. אם זו כבר הכתובת הזו, בדקו ב-Deployments של bloc שהפריסה האחרונה במצב Ready.` };
    }
    if (typeof json.code === "string" && typeof json.error === "string") return { ok: false, status: 502, code: json.code, error: json.error };
    return { ok: false, status: 502, code: "UPSTREAM_401",
      error: `${ltr(host)} ענה "אין הרשאה" (401), וזו לא תשובה של bloc. ודאו ש-BLOC_APP_URL הוא הכתובת של bloc (${DOMAIN_HINT}), ואז Redeploy לפאנל.` };
  }
  // 404 בלי code = החתימה נדחתה (bloc לא מאשר שה-endpoint קיים). 404 עם code =
  // תשובה עניינית של השירות (למשל "אין בקשה פתוחה").
  if (res.status === 404 && typeof json.code !== "string") {
    return { ok: false, status: 502, code: "REJECTED", error: `bloc דחה את הבקשה בכתובת ${ltr(host)} (סוד לא תואם, שעון שרת, או שהגרסה עוד לא נפרסה)` };
  }
  if (!res.ok) return { ok: false, status: res.status, code: typeof json.code === "string" ? json.code : undefined, error: typeof json.error === "string" ? json.error : "הפעולה נכשלה ב-bloc" };
  return { ok: true, status: res.status, data: json };
}
