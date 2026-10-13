"use client";
// AdExplainPanel — "למה המשתמש הזה לא רואה פרסומת?" (bloc ADS-1b). מייל של חשבון bloc ומסך → מה bloc היה מחליט
// עכשיו, ולכל קמפיין: מה לא מתאים. קריאה בלבד (ads.read). התשובה — מ-/api/ads/explain → bloc
// (/api/internal/ads/explain) → ad_explain (SQL 176).
import { useState } from "react";
import { Search, Check, X } from "lucide-react";
import { Section, Banner, Tag, solidBtn, inputStyle } from "@/components/ui/panelKit";
import { SCREENS, SCREEN_LABEL, type AdScreen } from "@/lib/ads";
import { parseExplain, explainView, type ExplainView } from "@/lib/adsExplain";

const TONE_COLOR = { ok: "var(--green)", wait: "var(--yellow)", danger: "var(--red)" } as const;

export default function AdExplainPanel() {
  const [email, setEmail] = useState("");
  const [screen, setScreen] = useState<AdScreen>("home");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<ExplainView | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function check() {
    if (!valid || busy) return;
    setBusy(true); setErr(null); setView(null);
    try {
      const r = await fetch("/api/ads/explain", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), screen }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(typeof j.error === "string" ? j.error : "הבדיקה נכשלה. נסו שוב."); return; }
      setView(explainView(parseExplain(j.result)));
    } catch {
      setErr("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="למה משתמש לא רואה פרסומת?" hint="מייל של חשבון ב-bloc. התשובה היא מה ש-bloc היה מחליט עכשיו בשבילו, ולכל קמפיין מה לא מתאים. שום דבר לא נרשם ולא נספר.">
      <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); void check(); }} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }} data-ads-explain-form="">
        <input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} type="email" dir="ltr"
          placeholder="email@example.com" aria-label="מייל של המשתמש" style={{ ...inputStyle, maxWidth: "320px" }} data-ads-explain-email="" />
        <div className="chips" role="radiogroup" aria-label="מסך" style={{ gap: "6px" }}>
          {SCREENS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={screen === s} className={`chip${screen === s ? " active" : ""}`}
              onClick={() => setScreen(s)} data-ads-explain-screen={s}
              style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "6px", ...(screen === s ? {} : { color: "var(--text-2)" }) }}>
              {screen === s && <Check size={15} strokeWidth={2.6} aria-hidden="true" />}
              {SCREEN_LABEL[s]}
            </button>
          ))}
        </div>
        <button type="submit" disabled={!valid || busy} style={{ ...solidBtn("var(--blue)"), opacity: !valid || busy ? 0.6 : 1 }} data-ads-explain-go="">
          <Search size={16} />{busy ? "בודקים…" : "בדיקה"}
        </button>
      </form>

      {err && <Banner tone="error"><span data-ads-explain-error="">{err}</span></Banner>}

      {view && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-ads-explain-result="">
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{view.title}</div>
            {view.who && <div style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "2px" }} data-ads-explain-who="">{view.who}</div>}
          </div>
          {view.verdict && (
            <p style={{ fontSize: "15.5px", fontWeight: 700, lineHeight: 1.6, color: TONE_COLOR[view.verdict.tone] }} data-ads-explain-verdict={view.verdict.tone}>
              {view.verdict.text}
            </p>
          )}
          {view.blockers.length > 0 && (
            <ul style={{ display: "flex", flexDirection: "column", gap: "4px", paddingInlineStart: "18px", listStyle: "disc", fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }} data-ads-explain-blockers="">
              {view.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          {view.notes.map((n) => <Banner key={n} tone="info"><span data-ads-explain-note="">{n}</span></Banner>)}

          {view.campaigns.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-ads-explain-campaigns="">
              {view.campaigns.map((c) => (
                <div key={c.id} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "6px" }} data-ads-explain-campaign={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{c.name}</div>
                      {c.advertiser && <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{c.advertiser}</div>}
                    </div>
                    <Tag tone={c.eligible ? "ok" : "danger"}>{c.eligible ? "מתאים לו עכשיו" : "לא מתאים לו עכשיו"}</Tag>
                  </div>
                  {c.failed.length > 0 ? (
                    <ul style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", color: "var(--text)", lineHeight: 1.5 }}>
                      {c.failed.map((f) => (
                        <li key={f} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }} data-ads-explain-failed="">
                          <X size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: "3px" }} aria-hidden="true" />{f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ fontSize: "14px", color: "var(--text-2)" }}>כל הכללים עוברים.</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {view.tips.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }} data-ads-explain-tips="">
              {view.tips.map((t) => <span key={t}>{t}</span>)}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
