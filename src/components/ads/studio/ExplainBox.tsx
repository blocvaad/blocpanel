"use client";
// studio/ExplainBox — "למה לא מוצג?" (bloc ADS-1b; ADS-2א v2): מייל של חשבון bloc, מסך, ואיפה במסך (מעל המסך / פס / ברשימה —
// לכל אחד כללי תדירות משלו) → מה bloc היה מחליט עכשיו, ולכל קמפיין מה לא מתאים. קריאה בלבד (ads.read): /api/ads/explain → bloc →
// ad_explain. בדף קמפיין — רק המקומות שהמודעות הפעילות שלו מכסות, והקמפיין עצמו ראשון ומסומן.
import { useState } from "react";
import { Search, Check, X } from "lucide-react";
import { Banner, Tag, solidBtn, inputStyle } from "@/components/ui/panelKit";
import { SCREENS, SCREEN_LABEL, type AdScreen } from "@/lib/ads";
import { parseExplain, explainView, type ExplainView } from "@/lib/adsExplain";
import { AD_SLOTS, FORMAT_INFO, SLOT_LABEL, SLOT_FORMATS_TEXT, type AdSlot } from "@/lib/adsFormats";
import { FormatGlyph } from "./kit";

const TONE_COLOR = { ok: "var(--green)", wait: "var(--yellow)", danger: "var(--red)" } as const;

/** הגוף של הבדיקה: slot נשלח רק כשהוא לא "מעל המסך" (הבקשה של full זהה לזו שלפני ADS-2א). */
export const explainBody = (email: string, screen: AdScreen, slot: AdSlot) => ({ email: email.trim(), screen, ...(slot !== "full" ? { slot } : {}) });

export function ExplainResultView({ view, focusCampaign }: { view: ExplainView; focusCampaign?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-ads-explain-result="">
      <div>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)" }}>{view.title}</div>
        {view.who && <div style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "2px" }} data-ads-explain-who="">{view.who}</div>}
      </div>
      {view.verdict && <p style={{ fontSize: "15.5px", fontWeight: 700, lineHeight: 1.6, color: TONE_COLOR[view.verdict.tone] }} data-ads-explain-verdict={view.verdict.tone}>{view.verdict.text}</p>}
      {view.blockers.length > 0 && (
        <ul style={{ display: "flex", flexDirection: "column", gap: "4px", paddingInlineStart: "18px", listStyle: "disc", fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }} data-ads-explain-blockers="">
          {view.blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {view.notes.map((n) => <Banner key={n} tone="info"><span data-ads-explain-note="">{n}</span></Banner>)}
      {view.campaigns.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-ads-explain-campaigns="">
          {view.campaigns.map((c) => (
            <div key={c.id} data-ads-explain-campaign={c.id} data-ads-explain-focus={c.id === focusCampaign ? "" : undefined}
              style={{ padding: "12px", borderRadius: "10px", border: `${c.id === focusCampaign ? 2 : 1}px solid ${c.id === focusCampaign ? "var(--blue)" : "var(--border)"}`, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>{c.name}{c.id === focusCampaign ? <span style={{ color: "var(--text-2)", fontWeight: 500 }}> (הקמפיין הזה)</span> : null}</div>
                  {c.advertiser && <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{c.advertiser}</div>}
                  {c.formats.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }} data-ads-explain-formats={c.formats.join(",")}>
                      {c.formats.map((f) => (
                        <span key={f} data-ads-explain-format={f} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px 2px 6px", borderRadius: "99px", background: "#3b82f614", color: "#93c5fd", fontSize: "12px", fontWeight: 600 }}>
                          <FormatGlyph format={f} size={12} />{FORMAT_INFO[f].label}
                        </span>
                      ))}
                    </div>
                  )}
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
              ) : <span style={{ fontSize: "14px", color: "var(--text-2)" }}>כל הכללים עוברים.</span>}
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
  );
}

export default function ExplainBox({ slots = [...AD_SLOTS], focusCampaign }: { slots?: AdSlot[]; focusCampaign?: string }) {
  const [email, setEmail] = useState("");
  const [screen, setScreen] = useState<AdScreen>("home");
  const [slotChoice, setSlot] = useState<AdSlot>(slots[0] ?? "full");
  const slot = slots.includes(slotChoice) ? slotChoice : slots[0] ?? "full";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<ExplainView | null>(null);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function check() {
    if (!valid || busy) return;
    setBusy(true); setErr(null); setView(null);
    try {
      const r = await fetch("/api/ads/explain", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(explainBody(email, screen, slot)),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(typeof j.error === "string" ? j.error : "הבדיקה נכשלה. נסו שוב."); return; }
      const v = explainView(parseExplain(j.result), new Date(), slot);
      if (focusCampaign) v.campaigns.sort((a, b) => Number(b.id === focusCampaign) - Number(a.id === focusCampaign));
      setView(v);
    } catch {
      setErr("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
    } finally {
      setBusy(false);
    }
  }
  const chip = (on: boolean): React.CSSProperties => ({ minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "6px", ...(on ? {} : { color: "var(--text-2)" }) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-explain-box={slots.join(",")}>
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>מייל של חשבון ב-bloc. התשובה היא מה ש-bloc היה מחליט עכשיו בשבילו, ולכל קמפיין מה לא מתאים. שום דבר לא נרשם ולא נספר.</p>
      <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); void check(); }} style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-ads-explain-form="">
        <input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} type="email" dir="ltr"
          placeholder="email@example.com" aria-label="מייל של המשתמש" style={inputStyle} data-ads-explain-email="" />
        <div className="chips" role="radiogroup" aria-label="מסך" style={{ gap: "6px" }}>
          {SCREENS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={screen === s} className={`chip${screen === s ? " active" : ""}`} onClick={() => setScreen(s)} data-ads-explain-screen={s} style={chip(screen === s)}>
              {screen === s && <Check size={15} strokeWidth={2.6} aria-hidden="true" />}{SCREEN_LABEL[s]}
            </button>
          ))}
        </div>
        {slots.length > 1 && (
          <div className="chips" role="radiogroup" aria-label="איפה במסך" style={{ gap: "6px" }} data-ads-explain-slots="">
            {slots.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={slot === s} className={`chip${slot === s ? " active" : ""}`} onClick={() => setSlot(s)} data-ads-explain-slot={s} title={SLOT_FORMATS_TEXT[s]} style={chip(slot === s)}>
                {slot === s && <Check size={15} strokeWidth={2.6} aria-hidden="true" />}{SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        {slots.length === 1 && <span style={{ fontSize: "13px", color: "var(--text-3)" }} data-ads-explain-fixed={slots[0]}>נבדק: {SLOT_LABEL[slots[0]]} ({SLOT_FORMATS_TEXT[slots[0]]}).</span>}
        <button type="submit" disabled={!valid || busy} style={{ ...solidBtn("var(--blue)"), alignSelf: "flex-start", opacity: !valid || busy ? 0.6 : 1 }} data-ads-explain-go="">
          <Search size={16} />{busy ? "בודקים…" : "בדיקה"}
        </button>
      </form>
      {err && <Banner tone="error"><span data-ads-explain-error="">{err}</span></Banner>}
      {view && <ExplainResultView view={view} focusCampaign={focusCampaign} />}
    </div>
  );
}
