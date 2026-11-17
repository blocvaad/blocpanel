"use client";
// studio/WizardSteps — פס השלבים של סטודיו המודעה (ADS-2ב2, החלטה 393): פורמטים · תוכן · עמוד לכל פורמט · סיכום. לכל שלב מספר,
// שם וסימן: ✓ (מוכן), כמה חסרים, "עלתה" או "לא עלתה". כל שלב לחיץ (שום שלב לא נעול — רק ההעלאה דורשת שהכל מוכן). קו התקדמות
// מתחת, ו"שלב 5 מתוך 6 — סטורי ממומן". השורה גוללת לצד בטלפון, והשלב הנוכחי נגלל לתוך המסך (aria-current="step").
import { useEffect, useRef } from "react";
import { Check, AlertCircle, Upload } from "lucide-react";
import { FORMAT_INFO } from "@/lib/adsFormats";
import { isFormatStep, stepLabel, type StepKey } from "@/lib/adsWizard";
import { FormatGlyph } from "./kit";

export type StepState =
  | { kind: "ready" } | { kind: "missing"; count: number } | { kind: "uploaded" } | { kind: "failed" } | { kind: "unclear" } | { kind: "saving" }
  | { kind: "info"; text: string; long?: string };

export function stepStateText(s: StepState): string {
  switch (s.kind) {
    case "ready": return "מוכן";
    case "missing": return s.count === 1 ? "חסר פרט אחד" : `חסרים ${s.count}`;
    case "uploaded": return "עלתה";
    case "failed": return "לא עלתה";
    case "unclear": return "ייתכן שעלתה";
    case "saving": return "מעלים…";
    case "info": return s.text;
  }
}

export interface WizardStepsProps { steps: StepKey[]; current: StepKey; state: (s: StepKey) => StepState; onStep: (s: StepKey) => void }

/** הפס עם המצב: השלב הנוכחי תמיד נגלל לתוך המסך (בטלפון רואים 2–3 מתוך עד 10 שלבים). */
export default function WizardSteps(p: WizardStepsProps) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [p.current]);
  return <div ref={box} style={{ minWidth: 0 }}><WizardStepsView {...p} /></div>;
}

/** הפס עצמו — תצוגה בלבד. */
export function WizardStepsView({ steps, current, state, onStep }: WizardStepsProps) {
  const at = Math.max(0, steps.indexOf(current));
  return (
    <nav aria-label="שלבי המודעה" data-wizard-steps={steps.join(",")} data-wizard-current={current} style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
        <span tabIndex={-1} style={{ fontSize: "14px", fontWeight: 800, color: "var(--text)", outline: "none" }} data-wizard-where={`${at + 1}/${steps.length}`}>
          שלב <span className="studio-num">{at + 1}</span> מתוך <span className="studio-num">{steps.length}</span> — {stepLabel(current)}
        </span>
        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-3)" }} data-wizard-where-state="">{(() => { const st = state(current); return st.kind === "info" ? st.long ?? st.text : stepStateText(st); })()}</span>
      </div>
      <ol className="studio-scroll" style={{ listStyle: "none", padding: "2px 0", margin: 0, gap: "6px" }}>
        {steps.map((s, i) => {
          const on = s === current;
          const st = state(s);
          const tone = st.kind === "ready" || st.kind === "uploaded" ? "var(--green)" : st.kind === "missing" || st.kind === "unclear" ? "var(--yellow)" : st.kind === "failed" ? "var(--red)" : "var(--text-3)";
          return (
            <li key={s} style={{ flexShrink: 0 }}>
              <button type="button" onClick={() => { if (!on) onStep(s); }} aria-current={on ? "step" : undefined} data-wizard-pill={s} data-pill-state={st.kind}
                aria-label={`שלב ${i + 1}: ${stepLabel(s)} — ${stepStateText(st)}`}
                style={{
                  minHeight: "44px", padding: "0 12px 0 10px", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap",
                  fontFamily: "inherit", fontSize: "13.5px", fontWeight: on ? 800 : 600, cursor: on ? "default" : "pointer",
                  border: `1px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "rgba(59,130,246,.14)" : "var(--card)", color: on ? "var(--text)" : "var(--text-2)",
                }}>
                <span className="studio-num" aria-hidden="true" style={{
                  width: "22px", height: "22px", borderRadius: "99px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800,
                  fontFamily: "var(--mono)", background: on ? "var(--blue)" : "var(--surface)", color: on ? "#fff" : "var(--text-2)", border: on ? "none" : "1px solid var(--border)",
                }}>{i + 1}</span>
                {isFormatStep(s) && <FormatGlyph format={s} size={14} />}
                <span>{isFormatStep(s) ? FORMAT_INFO[s].label : stepLabel(s)}</span>
                <span aria-hidden="true" data-pill-badge={st.kind} style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: tone, fontSize: "12px", fontWeight: 700 }}>
                  {st.kind === "ready" && <Check size={15} />}
                  {st.kind === "uploaded" && <><Upload size={15} />עלתה</>}
                  {st.kind === "missing" && <><AlertCircle size={14} /><span className="studio-num">{st.count}</span></>}
                  {st.kind === "failed" && <AlertCircle size={14} />}
                  {st.kind === "unclear" && <><AlertCircle size={14} />ייתכן</>}
                  {st.kind === "info" && <span className="studio-num" style={{ color: "var(--text-3)", fontWeight: 600 }}>{st.text}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" style={{ height: "4px", borderRadius: "99px", background: "var(--border)", overflow: "hidden" }}>
        <div data-wizard-progress={`${at + 1}/${steps.length}`} style={{ height: "100%", width: `${Math.round(((at + 1) / steps.length) * 100)}%`, background: "var(--blue)", borderRadius: "99px", transition: "width .25s ease" }} />
      </div>
    </nav>
  );
}
