"use client";
// src/components/ui/StepUpDialog.tsx — חלון "אישור פעולה רגישה" (PANEL-PAY א1, החלטה 364, C4; א2, החלטה 369).
//
// נפתח כשפעולת כסף נענית 403 stepup_required (lib/stepUpClient stepUpFetch): שליחת קוד בן 6 ספרות למייל, הקלדה, ואז
// הפעולה ממשיכה לבד (ניסיון חוזר אחד). שלושה שלבים על מסילה — כמו ציר הזמן של מסך קריאת השירות. קוד שגוי — כמה ניסיונות
// נשארו; נגמרו / פג — רק "שליחה מחדש". ביטול — הפעולה לא מתבצעת, והכרטיס אומר את זה.
//
// StepUpDialogView — התצוגה בלבד (props → markup), כדי שהבדיקה תרנדר כל מצב בשרת (בפאנל אין happy-dom).
// א2: לא רק כסף — גם ארכוב / השעיה / הפעלה של בניין ואימות ספק; what (מ-stepUpFetch) — מה מאשרים, בשורה מודגשת.
// StepUpHost — מותקן פעם אחת ב-PanelShell; מחבר את stepUpFetch לחלון.
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Mail } from "lucide-react";
import { Modal, Banner, ghostBtn, solidBtn } from "./panelKit";
import {
  registerStepUpHost, postStepUp, afterSend, afterVerify, codeInput, INITIAL_STEPUP, CODE_LEN,
  type StepUpState, type StepUpAnswer,
} from "@/lib/stepUpClient";

export type StepUpViewProps = {
  state: StepUpState;
  /** מה מאשרים ("העברה לארכיון: …") — בלי: ההסבר הכללי בלבד. */
  what?: string;
  onSend?: () => void;
  onCode?: (v: string) => void;
  onVerify?: () => void;
  onCancel?: () => void;
};

const muted: React.CSSProperties = { fontSize: "14px", color: "var(--text-2)", lineHeight: 1.65 };
const small: React.CSSProperties = { fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.6 };
const solidOn = (on: boolean): React.CSSProperties =>
  on ? { ...solidBtn("var(--blue)"), cursor: "pointer" } : { ...solidBtn("var(--border)", "var(--text-3)"), cursor: "not-allowed" };

const STEPS = ["קוד למייל", "הקלדת הקוד", "הפעולה ממשיכה"] as const;

/** המסילה: שלב שהושלם — וי כחול; הנוכחי — טבעת; הבא — אפור. */
function Track({ at }: { at: 0 | 1 }) {
  return (
    <ol aria-label="שלבי האישור" data-stepup-track={at} style={{ display: "flex", listStyle: "none", margin: 0, padding: 0, gap: 0 }}>
      {STEPS.map((label, i) => {
        const done = i < at;
        const now = i === at;
        const c = done || now ? "var(--blue)" : "var(--border-2)";
        return (
          <li key={label} aria-current={now ? "step" : undefined} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", position: "relative" }}>
            {i > 0 && <span aria-hidden style={{ position: "absolute", zIndex: 0, top: "11px", right: "-50%", width: "100%", height: "2px", background: done || now ? "var(--blue)" : "var(--border)" }} />}
            {/* העיגול מעל הקווים של שני הצדדים (הקו של השלב הבא מצויר אחריו ב-DOM) */}
            <span aria-hidden style={{
              position: "relative", zIndex: 1, width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: done ? "var(--blue)" : "var(--surface)", border: `2px solid ${c}`, color: done ? "#fff" : now ? "var(--blue)" : "var(--text-3)",
              fontSize: "12px", fontWeight: 700,
            }}>{done ? "✓" : i + 1}</span>
            <span style={{ fontSize: "12.5px", fontWeight: now ? 700 : 500, color: now ? "var(--text)" : "var(--text-3)", textAlign: "center" }}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** שש משבצות שמראות את הספרות; השדה האמיתי שקוף מעליהן (הדבקה, השלמה אוטומטית של קוד מ-SMS / מייל). */
function CodeCells({ s, onCode }: { s: StepUpState; onCode?: (v: string) => void }) {
  const digits = s.code.split("");
  const disabled = s.locked || s.busy === "verify";
  // סקירה #4 (נגישות): השדה מקבל את המיקוד כשהחלון עובר לשלב הקוד (autoFocus בהרכבה — גם המקלדת של הקוד נפתחת בטלפון),
  // ושוב אחרי קוד שגוי (הספרות מסומנות, הקלדה מחליפה אותן).
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (s.error && !disabled) { ref.current?.focus(); ref.current?.select(); }
  }, [s.error, disabled]);
  return (
    <div style={{ position: "relative" }} dir="ltr" data-stepup-cells="">
      <div aria-hidden style={{ display: "grid", gridTemplateColumns: `repeat(${CODE_LEN}, 1fr)`, gap: "8px" }}>
        {Array.from({ length: CODE_LEN }, (_, i) => {
          const filled = i < digits.length;
          const active = !disabled && i === Math.min(digits.length, CODE_LEN - 1) && digits.length < CODE_LEN;
          return (
            <span key={i} data-stepup-cell={filled ? digits[i] : ""} style={{
              height: "54px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--card)", border: `1.5px solid ${s.error && !s.locked ? "#ef444488" : active ? "var(--blue)" : filled ? "var(--border-2)" : "var(--border)"}`,
              fontFamily: "var(--mono)", fontSize: "22px", fontWeight: 700, color: disabled ? "var(--text-3)" : "var(--text)",
            }}>{filled ? digits[i] : ""}</span>
          );
        })}
      </div>
      <input
        ref={ref} autoFocus
        aria-label="קוד בן 6 ספרות מהמייל" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={CODE_LEN}
        value={s.code} onChange={(e) => onCode?.(e.target.value)} disabled={disabled} data-stepup-code=""
        aria-invalid={s.error && !s.locked ? true : undefined} aria-describedby={s.error ? "stepup-error" : undefined}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, fontSize: "16px", cursor: disabled ? "not-allowed" : "text" }}
      />
    </div>
  );
}

/** ההסבר הכללי — אילו פעולות מאושרות בקוד (החלטות 364, 369). */
export const STEPUP_EXPLAIN = "פעולה שמשנה כסף, זכאות או גישה — מסלול, קרדיטים, ספקי סליקה, ראשות ועד, השעיה או ארכוב של בניין, אימות ספק. כדי להמשיך מאשרים בקוד חד-פעמי מהמייל.";

export function StepUpDialogView({ state: s, what, onSend, onCode, onVerify, onCancel }: StepUpViewProps) {
  const busy = !!s.busy;
  const ready = s.code.length === CODE_LEN && !s.locked && !busy;
  // נגמרו הניסיונות / הקוד פג — השדה נסגר, והמיקוד עובר ל"שליחה מחדש" (הדבר היחיד שאפשר לעשות).
  const resendRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (s.locked) resendRef.current?.focus(); }, [s.locked]);
  return (
    <Modal title="אישור פעולה רגישה" onClose={onCancel ?? (() => {})} busy={busy} width={440}>
      <div data-stepup-dialog="" data-stepup-phase={s.phase} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span aria-hidden style={{ width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "#3b82f618", color: "var(--blue)", flexShrink: 0 }}>
            <ShieldCheck size={20} />
          </span>
          <p style={muted}>{STEPUP_EXPLAIN}</p>
        </div>
        {what && (
          <div data-stepup-what="" style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "10px 14px", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--border-2)", borderInlineStart: "3px solid var(--blue)" }}>
            <span style={small}>מאשרים עכשיו</span>
            <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", lineHeight: 1.5 }}>{what}</span>
          </div>
        )}

        <Track at={s.phase === "send" ? 0 : 1} />

        {s.phase === "send" ? (
          <>
            <p style={small}>האישור תקף 10 דקות, רק בחיבור הזה. אחרי הקוד הפעולה ממשיכה לבד — לא צריך ללחוץ שוב.</p>
            {s.error && <div id="stepup-error" data-stepup-error=""><Banner tone="error">{s.error}</Banner></div>}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={onSend} disabled={busy} data-stepup-send="" style={{ ...solidOn(!busy), flex: "1 1 200px" }}>
                <Mail size={17} aria-hidden /> {s.busy === "send" ? "שולחים…" : "שליחת קוד למייל"}
              </button>
              <button type="button" onClick={onCancel} disabled={busy} data-stepup-cancel="" style={{ ...ghostBtn, flex: "1 1 110px", minHeight: "48px" }}>ביטול</button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (ready) onVerify?.(); }} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={muted} data-stepup-sent="">
              שלחנו קוד בן 6 ספרות{s.sentTo ? <> ל-<bdi dir="ltr" style={{ color: "var(--text)" }}>{s.sentTo}</bdi></> : " למייל שלך"}. הקוד תקף 10 דקות.
            </p>
            {s.devCode && <p data-stepup-dev="" style={{ ...small, color: "var(--yellow)" }}>מצב פיתוח — המייל לא נשלח. הקוד: <bdi dir="ltr">{s.devCode}</bdi></p>}
            <CodeCells s={s} onCode={onCode} />
            {s.error && <div id="stepup-error" data-stepup-error={s.locked ? "locked" : "wrong"}><Banner tone="error">{s.error}</Banner></div>}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="submit" disabled={!ready} data-stepup-verify="" style={{ ...solidOn(ready), flex: "1 1 180px" }}>
                {s.busy === "verify" ? "בודקים…" : "אישור והמשך"}
              </button>
              <button type="button" ref={resendRef} onClick={onSend} disabled={busy} data-stepup-resend=""
                style={{ ...ghostBtn, flex: "1 1 140px", minHeight: "48px", ...(s.locked ? { borderColor: "var(--blue)", color: "var(--text)" } : {}) }}>
                {s.busy === "send" ? "שולחים…" : "שליחה מחדש"}
              </button>
            </div>
            <button type="button" onClick={onCancel} disabled={busy} data-stepup-cancel=""
              style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "13.5px", minHeight: "40px", cursor: busy ? "default" : "pointer" }}>
              ביטול — בלי לבצע את הפעולה
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}

/** החלון עם המצב שלו. done(true) — הקוד אושר והעוגייה נשמרה; done(false) — בוטל. */
export default function StepUpDialog({ onDone, what, api = postStepUp }: { onDone: (ok: boolean) => void; what?: string; api?: (b: { action: "send" } | { action: "verify"; code: string }) => Promise<StepUpAnswer> }) {
  const [s, setS] = useState<StepUpState>(INITIAL_STEPUP);

  async function send() {
    if (s.busy) return;
    setS((x) => ({ ...x, busy: "send", error: null }));
    const a = await api({ action: "send" });
    setS((x) => afterSend(a, x));
  }

  async function verify() {
    if (s.busy || s.locked || s.code.length !== CODE_LEN) return;
    const code = s.code;
    setS((x) => ({ ...x, busy: "verify", error: null }));
    const a = await api({ action: "verify", code });
    const o = afterVerify(a, { ...s, busy: null });
    if (o.done) onDone(true);
    else setS(o.state);
  }

  return (
    <StepUpDialogView
      state={s}
      what={what}
      onSend={() => void send()}
      onCode={(v) => setS((x) => ({ ...x, code: codeInput(v), error: x.locked ? x.error : null }))}
      onVerify={() => void verify()}
      onCancel={() => { if (!s.busy) onDone(false); }}
    />
  );
}

/** מותקן פעם אחת (PanelShell): stepUpFetch פותח דרכו את החלון ומחכה לתוצאה. what — מה מאשרים (א2). */
export function StepUpHost() {
  const [open, setOpen] = useState<{ done: (ok: boolean) => void; what?: string } | null>(null);
  useEffect(() => registerStepUpHost((d, what) => setOpen({ done: d, what })), []);
  if (!open) return null;
  return <StepUpDialog what={open.what} onDone={(ok) => { setOpen(null); open.done(ok); }} />;
}
