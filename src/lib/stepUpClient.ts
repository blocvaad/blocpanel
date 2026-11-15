// src/lib/stepUpClient.ts — אישור לפעולת כסף בדפדפן (PANEL-PAY א1, החלטה 364, C4).
//
// stepUpFetch(url, init) — במקום fetch בכל פעולת כסף: אם השרת עונה 403 { code: 'stepup_required' }, נפתח חלון הקוד
// (StepUpHost, ב-PanelShell), ואחרי קוד נכון הבקשה נשלחת שוב — פעם אחת. ביטול / אין חלון — חוזרת התשובה המקורית (403),
// והכרטיס מראה את ההודעה שלה. אף פעם לא לולאה: ניסיון חוזר אחד, גם אם השרת עונה שוב stepup_required.
// בלי crypto ובלי next/server — הקובץ בחבילת הדפדפן.
import { STEPUP_REQUIRED_CODE, STEPUP_CANCELLED_TEXT } from "./stepUpShared";

type Done = (ok: boolean) => void;
type Host = (done: Done) => void;

let host: Host | null = null;
let pending: Promise<boolean> | null = null;

/** החלון מתחבר (PanelShell); מחזיר ניתוק. */
export function registerStepUpHost(h: Host | null): () => void {
  host = h;
  return () => { if (host === h) host = null; };
}

/** פותח את חלון הקוד (אחד בכל פעם — בקשה שנייה מצטרפת לראשונה). בלי חלון — false. */
export function requestStepUp(): Promise<boolean> {
  if (pending) return pending;
  const h = host;
  if (!h) return Promise.resolve(false);
  pending = new Promise<boolean>((resolve) => {
    let settled = false;
    h((ok) => { if (settled) return; settled = true; pending = null; resolve(ok); });
  });
  return pending;
}

/** 403 עם הקוד stepup_required (התשובה עצמה נשארת קריאה — קוראים מעותק). */
export async function isStepUpRequired(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const j = (await res.clone().json()) as { code?: unknown } | null;
    return j?.code === STEPUP_REQUIRED_CODE;
  } catch {
    return false;
  }
}

export type StepUpDeps = { fetch?: (input: string, init?: RequestInit) => Promise<Response>; request?: () => Promise<boolean> };

/** fetch לפעולת כסף: stepup_required → חלון הקוד → אותה בקשה שוב, פעם אחת. */
export async function stepUpFetch(input: string, init?: RequestInit, deps: StepUpDeps = {}): Promise<Response> {
  const f = deps.fetch ?? ((i: string, n?: RequestInit) => fetch(i, n));
  const res = await f(input, init);
  if (!(await isStepUpRequired(res))) return res;
  const ok = await (deps.request ?? requestStepUp)();
  if (!ok) return res;
  return f(input, init);
}

// ── חלון הקוד: הבקשות לשרת והמעברים (טהורים — נבדקים בלי DOM) ──

export type StepUpAnswer = {
  ok: boolean; status: number;
  j: { error?: string; code?: string; remaining?: number; sent_to?: string | null; expires_at?: string; dev_code?: string };
} | null;

export async function postStepUp(body: { action: "send" } | { action: "verify"; code: string }, f: typeof fetch = fetch): Promise<StepUpAnswer> {
  try {
    const r = await f("/api/auth/stepup", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  } catch {
    return null;
  }
}

export type StepUpPhase = "send" | "code";
export type StepUpState = {
  phase: StepUpPhase;
  code: string;
  sentTo: string | null;
  error: string | null;
  /** נגמרו הניסיונות / הקוד פג — רק "שליחה מחדש". */
  locked: boolean;
  busy: null | "send" | "verify";
  /** פיתוח בלבד: המייל נכשל והשרת החזיר את הקוד. */
  devCode: string | null;
};

export const INITIAL_STEPUP: StepUpState = { phase: "send", code: "", sentTo: null, error: null, locked: false, busy: null, devCode: null };
export const STEPUP_NET_ERROR = "אין חיבור לשרת. בדקו את החיבור ונסו שוב.";
export const CODE_LEN = 6;

/** רק ספרות, עד 6 (הדבקה של "123 456" או של המייל כולו — נשארות הספרות). */
export function codeInput(v: string): string {
  return v.replace(/\D/g, "").slice(0, CODE_LEN);
}

export function afterSend(a: StepUpAnswer, s: StepUpState): StepUpState {
  if (!a) return { ...s, busy: null, error: STEPUP_NET_ERROR };
  if (a.ok) {
    return { ...s, phase: "code", busy: null, error: null, locked: false, code: "", sentTo: a.j.sent_to ?? null, devCode: a.j.dev_code ?? null };
  }
  return { ...s, busy: null, error: a.j.error ?? "שליחת הקוד נכשלה. נסו שוב." };
}

/** done = הקוד נכון, האישור נשמר (עוגייה) — סוגרים את החלון ושולחים שוב את הפעולה. */
export function afterVerify(a: StepUpAnswer, s: StepUpState): { state: StepUpState; done: boolean } {
  if (!a) return { state: { ...s, busy: null, error: STEPUP_NET_ERROR }, done: false };
  if (a.ok) return { state: { ...s, busy: null, error: null }, done: true };
  const code = a.j.code;
  const locked = code === "too_many_tries" || code === "expired" || code === "none" || code === "used"
    || (code === "wrong" && typeof a.j.remaining === "number" && a.j.remaining <= 0);
  return { state: { ...s, busy: null, error: a.j.error ?? "הקוד לא אושר. נסו שוב.", locked, code: locked ? "" : s.code }, done: false };
}

/** המשפט לכרטיס אחרי פעולה שנכשלה: חלון הקוד בוטל (התשובה נשארה stepup_required) — אומרים שלא בוצע; אחרת — המשפט מהשרת. */
export function actionErrorText(j: { error?: string; code?: string } | null | undefined, fallback: string): string {
  if (j?.code === STEPUP_REQUIRED_CODE) return STEPUP_CANCELLED_TEXT;
  return j?.error ?? fallback;
}
