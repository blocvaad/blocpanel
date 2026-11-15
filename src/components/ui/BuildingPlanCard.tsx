"use client";
// src/components/ui/BuildingPlanCard.tsx — "מסלול בלי חיוב" בדף הבניין (PANEL-PAY א1, החלטה 363).
//
// עד עכשיו המסלול נקבע בטופס העריכה וביצירה, וגם admin יכול היה להעניק מסלול בתשלום בלי חיוב. עכשיו — פעולה נפרדת,
// כמו בחברות ניהול: הענקה (מסלול + סיבה) או סיום, סופר-אדמין בלבד, עם קוד אישור למייל, דרך bloc (/api/buildings/[id]/plan).
// הכרטיס מראה את המסלול השמור עם תאריך הסיום שלו (במילים), הסיבה ומי העניק (מיומן הפאנל), ציר של ההענקות והסיומים, ומה
// אפשר עכשיו: מנוי משלם — אין הענקה (bloc היה עונה 409); כיסוי של חברת ניהול — אין צורך בהענקה, והענקה קיימת מוצגת ואפשר
// לסיים אותה; מסלול עם תאריך סיום (ניסיון, העברת ועד, חסד, רדום, מנוי שבוטל) — אין "תיעוד": הענקה שם רק מפורשת, והכפתור
// שלה אומר שהתאריך נמחק (סקירה #1). כשל בטעינה — נאמר, לא ריק.
//
// BuildingPlanView — התצוגה בלבד (props → markup), כדי שהבדיקה תרנדר כל מצב בשרת (בפאנל אין happy-dom).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, History, RefreshCw } from "lucide-react";
import { Banner, Tag, ghostBtn, solidBtn, inputStyle } from "./panelKit";
import { planLabel } from "@/lib/plans";
import {
  planCardMode, canGrantIn, canEnd, isGrantedPlan, modeLine, checkReason, grantBody, endBody, afterPlanAction, shortDate, longDate,
  datedKind, datedGrantWarning, escapeCloses, MODE_TAG, DATED_TAG, REFRESH_CODES, GRANTABLE_PLANS, VIEW_ONLY_TEXT, FACTS_ERROR_TEXT,
  ORIGIN_ERROR_TEXT, ORIGIN_UNKNOWN_TEXT, HISTORY_ERROR_TEXT, REASON_MAX,
  type BuildingPlanInfo, type PlanFacts, type GrantOrigin, type PlanHistory, type PlanMsg, type PlanAnswer, type PlanEvent,
} from "@/lib/buildingPlan";
import { stepUpFetch, actionErrorText } from "@/lib/stepUpClient";

export type PlanBusy = null | "grant" | "end_grant";
export type BuildingPlanViewProps = {
  info: BuildingPlanInfo;
  facts: PlanFacts;
  origin: GrantOrigin;
  history: PlanHistory;
  canAct: boolean;
  plan: string;
  reason: string;
  reasonError: string | null;
  confirmEnd: boolean;
  /** מסלול עם תאריך סיום: טופס ההענקה נפתח רק בלחיצה מפורשת ("הענקה במקום התאריך"). */
  grantOpen?: boolean;
  busy: PlanBusy;
  msg: PlanMsg | null;
  /** לבדיקות ולצילומים — "עכשיו" של ימי הניסיון / החסד. */
  now?: number;
  onPlan?: (p: string) => void;
  onReason?: (v: string) => void;
  onGrant?: () => void;
  onOpenGrant?: () => void;
  onCloseGrant?: () => void;
  onOpenEnd?: () => void;
  onCloseEnd?: () => void;
  onEnd?: () => void;
  onRefresh?: () => void;
};

const muted: React.CSSProperties = { fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 };
const small: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.6 };
const box: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)" };
const solidOn = (on: boolean, bg = "var(--blue)"): React.CSSProperties =>
  on ? { ...solidBtn(bg), cursor: "pointer" } : { ...solidBtn("var(--border)", "var(--text-3)"), cursor: "not-allowed" };

/** ברירת המחדל בטופס ההענקה: המסלול הנוכחי (תיעוד של מסלול בלי סיבה / המסלול של הניסיון), אחרת Pro. */
export function defaultGrantPlan(info: BuildingPlanInfo): string {
  return info.plan && info.plan !== "free" && GRANTABLE_PLANS.some((p) => p.value === info.plan) ? info.plan : "tower";
}

function Origin({ origin }: { origin: GrantOrigin }) {
  if (origin.state === "error") return <span data-plan-origin="error" style={{ color: "var(--yellow)" }}>{ORIGIN_ERROR_TEXT}</span>;
  if (!origin.who) return <span data-plan-origin="unknown" style={{ color: "var(--text-3)" }}>{ORIGIN_UNKNOWN_TEXT}</span>;
  return (
    <span data-plan-origin="known">
      <bdi dir="ltr">{origin.who}</bdi>{origin.at ? <span style={{ color: "var(--text-3)" }}> · {shortDate(origin.at)}</span> : null}
    </span>
  );
}

/** "עד <תאריך במילים>" כשיש תאריך סיום, אחרת "בלי תפוגה". */
function Until({ info }: { info: BuildingPlanInfo }) {
  const d = longDate(info.planExpires);
  return d
    ? <span data-plan-until={info.planExpires ?? ""} style={{ fontSize: "13px", color: "var(--text-2)" }}>· עד {d}</span>
    : <span data-plan-until="" style={{ fontSize: "13px", color: "var(--text-3)" }}>· בלי תפוגה</span>;
}

function CurrentGrant({ info, origin, documented }: { info: BuildingPlanInfo; origin: GrantOrigin; documented: boolean }) {
  return (
    <div style={box} data-plan-current="">
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }} data-plan-name="">{planLabel(info.plan)}</span>
        <span style={{ fontSize: "13px", color: "var(--text-3)" }}>· בלי חיוב</span>
        <Until info={info} />
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: "14px", margin: 0 }}>
        <dt style={{ color: "var(--text-3)" }}>הסיבה</dt>
        <dd style={{ margin: 0, color: documented ? "var(--text)" : "var(--yellow)", wordBreak: "break-word", whiteSpace: "pre-line" }} data-plan-reason="">
          {documented ? info.compReason : "אין סיבה מתועדת"}
        </dd>
        <dt style={{ color: "var(--text-3)" }}>מי העניק</dt>
        <dd style={{ margin: 0, color: "var(--text)", minWidth: 0, wordBreak: "break-word" }}><Origin origin={origin} /></dd>
      </dl>
    </div>
  );
}

/** מסלול עם תאריך סיום (בלי הענקה): המסלול, מה הוא ועד מתי — התאריך במילים, בשעון ישראל. */
function DatedPlan({ info, facts, now }: { info: BuildingPlanInfo; facts: PlanFacts; now: number }) {
  const kind = datedKind(info, facts, now);
  return (
    <div style={box} data-plan-dated={kind}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }} data-plan-name="">{planLabel(info.plan)}</span>
        <Until info={info} />
        <span data-plan-dated-tag=""><Tag tone={DATED_TAG[kind].tone}>{DATED_TAG[kind].text}</Tag></span>
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<PlanEvent["kind"], string> = { granted: "הוענק", ended: "הסתיים", legacy: "נקבע בטופס העריכה" };

function Timeline({ history }: { history: PlanHistory }) {
  if (history.state === "error") return <p data-plan-history="error" style={small}>{HISTORY_ERROR_TEXT}</p>;
  const events = history.events.filter((e) => !e.unchanged);
  if (!events.length) return null;
  return (
    <div data-plan-history="">
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-3)", marginBottom: "8px" }}>
        <History size={14} aria-hidden /> היסטוריה
      </div>
      <ol style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
        {events.slice(0, 4).map((e, i) => (
          <li key={`${e.at}-${i}`} data-plan-event={e.kind} style={{ borderInlineStart: `2px solid ${e.kind === "ended" ? "#f9731666" : "var(--border-2)"}`, paddingInlineStart: "10px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
              <b style={{ fontSize: "14px", color: "var(--text)" }}>{EVENT_LABEL[e.kind]}{e.plan && e.kind !== "ended" ? ` · ${planLabel(e.plan)}` : ""}</b>
              {e.who && <bdi dir="ltr" style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{e.who}</bdi>}
              <span style={{ fontSize: "12.5px", color: "var(--text-3)" }}>{shortDate(e.at)}</span>
            </div>
            {e.reason && <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "2px", whiteSpace: "pre-line" }}>{e.reason}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function GrantForm({ p, documenting, dated }: { p: BuildingPlanViewProps; documenting: boolean; dated: boolean }) {
  const reasonOk = p.reason.trim().length >= 3;
  const busy = !!p.busy;
  const label = planLabel(p.plan);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!busy) p.onGrant?.(); }} data-plan-grant-form={dated ? "dated" : ""} style={{ ...box, gap: "12px" }}>
      {dated && <div data-plan-dated-warning=""><Banner tone="warn">{datedGrantWarning(p.info)}</Banner></div>}
      <div role="radiogroup" aria-label="מסלול להענקה" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
        {GRANTABLE_PLANS.map((o) => {
          const on = p.plan === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} data-plan-option={o.value} onClick={() => p.onPlan?.(o.value)} disabled={busy}
              style={{ minHeight: "58px", padding: "8px 10px", borderRadius: "10px", border: `2px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "#3b82f61f" : "var(--card)", textAlign: "right", color: "var(--text)", cursor: busy ? "default" : "pointer" }}>
              <span style={{ display: "block", fontSize: "15px", fontWeight: 700, color: on ? "var(--blue)" : "var(--text)" }}>{o.label}</span>
              <span style={{ display: "block", fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>במקום ₪{o.price} לחודש</span>
            </button>
          );
        })}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13.5px", color: "var(--text-2)" }}>
        למה בלי חיוב (חובה)
        <input value={p.reason} onChange={(e) => p.onReason?.(e.target.value)} maxLength={REASON_MAX} disabled={busy} data-plan-reason-input=""
          placeholder="למשל: בניין בדיקות של הצוות, פיילוט עד מרץ, שותף" aria-invalid={p.reasonError ? true : undefined}
          aria-describedby={p.reasonError ? "plan-reason-error" : undefined} style={inputStyle} />
      </label>
      {p.reasonError && <p id="plan-reason-error" role="alert" data-plan-reason-error="" style={{ fontSize: "13.5px", color: "var(--red)" }}>{p.reasonError}</p>}
      <button type="submit" disabled={busy || !reasonOk} data-plan-grant="" style={solidOn(!busy && reasonOk, dated ? "#d97706" : "var(--blue)")}>
        <Gift size={16} aria-hidden />
        {p.busy === "grant" ? "מעניקים…"
          : dated ? `הענקת ${label} בלי חיוב — בלי תאריך סיום`
          : documenting ? `תיעוד ${label} כמסלול מוענק` : `הענקת ${label} בלי חיוב`}
      </button>
      {dated ? (
        <button type="button" onClick={p.onCloseGrant} disabled={busy} data-plan-grant-cancel="" style={{ ...ghostBtn, minHeight: "44px" }}>ביטול — להשאיר את התאריך</button>
      ) : (
        <p style={small}>הבניין מקבל את המסלול מיד, בלי PayPlus ובלי תפוגה. אם יש לבניין מנוי משלם או חברת ניהול שמכסה אותו — bloc יסרב.</p>
      )}
    </form>
  );
}

function EndConfirm({ p }: { p: BuildingPlanViewProps }) {
  const label = planLabel(p.info.plan);
  const busy = !!p.busy;
  // סקירה #4 (נגישות): האישור לוקח את המיקוד על כפתור האישור, ו-Escape סוגר אותו (לא באמצע שליחה).
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { goRef.current?.focus(); }, []);
  return (
    <div role="alertdialog" aria-labelledby="plan-end-title" aria-describedby="plan-end-body" data-plan-end-confirm=""
      onKeyDown={(e) => { if (escapeCloses(e.key, busy)) { e.stopPropagation(); p.onCloseEnd?.(); } }}
      style={{ ...box, background: "var(--card)", borderColor: "#f9731655" }}>
      <div id="plan-end-title" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>לסיים את מסלול {label}?</div>
      <p id="plan-end-body" style={muted}>
        הבניין יחזור מיד ל&quot;ללא מסלול&quot;: היכולות של {label} ייסגרו לוועד ולדיירים. אין כאן חיוב או החזר — המסלול ניתן בלי
        תשלום. אפשר להעניק שוב אחר כך.
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" ref={goRef} onClick={p.onEnd} disabled={busy} data-plan-end-go="" style={{ ...solidOn(!busy, "#ef4444"), flex: "1 1 160px" }}>
          {p.busy === "end_grant" ? "מסיימים…" : "סיום המסלול"}
        </button>
        <button type="button" onClick={p.onCloseEnd} disabled={busy} data-plan-end-cancel="" style={{ ...ghostBtn, flex: "0 1 110px", minHeight: "48px" }}>ביטול</button>
      </div>
    </div>
  );
}

export function BuildingPlanView(p: BuildingPlanViewProps) {
  const now = p.now ?? Date.now();
  const mode = planCardMode(p.info, p.facts);
  const tag = MODE_TAG[mode];
  const line = modeLine(mode, p.info, p.facts, now);
  const granted = isGrantedPlan(p.info);
  const showCurrent = granted || mode === "undocumented";
  const endable = canEnd(mode, p.info);
  const grantVisible = canGrantIn(mode) && !p.confirmEnd && (mode !== "dated" || !!p.grantOpen);
  // סקירה #4: אחרי שאישור הסיום נסגר — המיקוד חוזר לכפתור "סיום המסלול המוענק".
  const endRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !p.confirmEnd) endRef.current?.focus();
    wasOpen.current = p.confirmEnd;
  }, [p.confirmEnd]);
  const refresh = !!p.msg && !p.msg.ok && !!p.msg.code && REFRESH_CODES.has(p.msg.code) && !!p.onRefresh;
  const msgEl = p.msg && (p.msg.ok
    ? <p role="status" data-plan-msg="ok" style={{ fontSize: "14px", color: "var(--green)" }}>{p.msg.text}</p>
    : <div data-plan-msg="error"><Banner tone="error" action={refresh ? (
        <button type="button" onClick={p.onRefresh} style={ghostBtn} data-plan-refresh=""><RefreshCw size={14} aria-hidden /> רענון</button>
      ) : undefined}>{p.msg.text}</Banner></div>);

  return (
    <section className="card" aria-labelledby="plan-card-title" data-plan-card="" data-plan-mode={mode}
      style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <header style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span aria-hidden style={{ width: "34px", height: "34px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#3b82f618", color: "var(--blue)", flexShrink: 0 }}>
          <Gift size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <h2 id="plan-card-title" style={{ fontSize: "15.5px", fontWeight: 700, color: "var(--text)" }}>מסלול בלי חיוב</h2>
            <span data-plan-tag={mode}><Tag tone={tag.tone}>{tag.text}</Tag></span>
          </div>
          <p style={{ ...muted, marginTop: "3px" }}>לפיילוט, לבניין בדיקות או לשותף — בלי PayPlus, תמיד עם סיבה מתועדת.</p>
        </div>
      </header>

      {p.facts.state === "error" && <div data-plan-facts-error=""><Banner tone="warn">{FACTS_ERROR_TEXT}</Banner></div>}

      {mode === "dated" && <DatedPlan info={p.info} facts={p.facts} now={now} />}
      {showCurrent && <CurrentGrant info={p.info} origin={p.origin} documented={granted} />}
      {line && <p style={muted} data-plan-line="">{line}</p>}

      {p.canAct ? (
        <>
          {mode === "dated" && !p.grantOpen && !p.confirmEnd && (
            <button type="button" onClick={p.onOpenGrant} disabled={!!p.busy} data-plan-grant-open=""
              style={{ ...ghostBtn, minHeight: "48px", alignSelf: "stretch" }}>
              <Gift size={15} aria-hidden /> הענקה בלי חיוב במקום התאריך…
            </button>
          )}
          {grantVisible && <GrantForm p={p} documenting={mode === "undocumented" && p.plan === p.info.plan} dated={mode === "dated"} />}
          {endable && !p.confirmEnd && (
            <button type="button" ref={endRef} onClick={p.onOpenEnd} disabled={!!p.busy} data-plan-end=""
              style={{ ...ghostBtn, minHeight: "48px", color: "#ef4444", borderColor: "#ef444455", alignSelf: "stretch" }}>
              סיום המסלול המוענק
            </button>
          )}
          {p.confirmEnd && endable && <EndConfirm p={p} />}
        </>
      ) : (
        <p data-plan-viewonly="" style={small}>{VIEW_ONLY_TEXT}</p>
      )}

      {msgEl}
      <Timeline history={p.history} />

      <p style={small}>כל הענקה וסיום עוברים דרך bloc, עם קוד אישור למייל, ונרשמים ביומן — מי, מתי ולמה.</p>
    </section>
  );
}

export default function BuildingPlanCard({ buildingId, info: info0, facts, origin, history, canAct }: {
  buildingId: string; info: BuildingPlanInfo; facts: PlanFacts; origin: GrantOrigin; history: PlanHistory; canAct: boolean;
}) {
  const router = useRouter();
  const [info, setInfo] = useState<BuildingPlanInfo>(info0);
  // אחרי router.refresh() השרת שולח את המסלול מחדש — מתעדכנים ממנו.
  useEffect(() => { setInfo(info0); }, [info0.plan, info0.compReason, info0.planExpires]); // eslint-disable-line react-hooks/exhaustive-deps
  const [plan, setPlan] = useState(() => defaultGrantPlan(info0));
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [busy, setBusy] = useState<PlanBusy>(null);
  const [msg, setMsg] = useState<PlanMsg | null>(null);

  async function post(body: ReturnType<typeof grantBody> | ReturnType<typeof endBody>): Promise<PlanAnswer> {
    try {
      const r = await stepUpFetch(`/api/buildings/${buildingId}/plan`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, j: r.ok ? j : { ...j, error: actionErrorText(j, "הפעולה נכשלה. נסו שוב.") } };
    } catch {
      return null;
    }
  }

  async function run(action: "grant" | "end_grant") {
    if (busy) return;
    let body: ReturnType<typeof grantBody> | ReturnType<typeof endBody>;
    if (action === "grant") {
      const c = checkReason(reason);
      if (!c.ok) { setReasonError(c.error); return; }
      body = grantBody(plan, c.value, info.plan);
    } else {
      body = endBody(info.plan);
    }
    setBusy(action); setMsg(null); setReasonError(null);
    const o = afterPlanAction(await post(body), action, info, plan);
    setInfo(o.info);
    setMsg(o.msg);
    if (o.closeConfirm) setConfirmEnd(false);
    if (o.clearReason) { setReason(""); setGrantOpen(false); }
    setBusy(null);
    if (o.msg.ok) router.refresh();
  }

  return (
    <BuildingPlanView
      info={info} facts={facts} origin={origin} history={history} canAct={canAct}
      plan={plan} reason={reason} reasonError={reasonError} confirmEnd={confirmEnd} grantOpen={grantOpen} busy={busy} msg={msg}
      onPlan={(v) => { setPlan(v); setMsg(null); }}
      onReason={(v) => { setReason(v); setReasonError(null); }}
      onGrant={() => void run("grant")}
      onOpenGrant={() => { setGrantOpen(true); setMsg(null); }}
      onCloseGrant={() => { setGrantOpen(false); setReasonError(null); }}
      onOpenEnd={() => { setConfirmEnd(true); setMsg(null); }}
      onCloseEnd={() => setConfirmEnd(false)}
      onEnd={() => void run("end_grant")}
      onRefresh={() => router.refresh()}
    />
  );
}
