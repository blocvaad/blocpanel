"use client";
// studio/AudienceEditor — "קהל" (bloc ADS-2א v2, החלטות 382–383): מסכים, מסלולים, דיירים / ועד, ערים (השלמה אוטומטית) ובניינים —
// עם מד חי מ-ad_estimate_reach ("כ-1,240 משתמשים ב-38 בניינים" / "פחות מ-10"), בהשהיה קצרה אחרי כל שינוי. נכשל — "לא הצלחנו
// להעריך כרגע" (אף פעם לא 0); לפני SQL 230 — "ההערכה תופיע אחרי SQL 230". AudienceEditorView / ReachGauge — תצוגה בלבד.
import { useEffect, useState } from "react";
import { Search, X, Users } from "lucide-react";
import { Banner, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { ChipSet } from "../adsKit";
import {
  SCREENS, SCREEN_LABEL, AD_PLANS, PLAN_LABEL, AD_ROLES, ROLE_LABEL, screensWarning, audienceSummary, fmtInt,
} from "@/lib/ads";
import { ESTIMATE_K_TEXT, estimateAnswer, estimateBody, reachText, type CampaignForm, type ReachState } from "@/lib/adsStudio";
import type { AdBuildingOption } from "@/lib/adsServer";

export type AudienceValue = Pick<CampaignForm, "screens" | "plans" | "roles" | "cities" | "building_ids">;

/** ערים להשלמה: מה שמכיל את מה שהוקלד, בלי מה שכבר נבחר — עד 8. */
export function cityMatches(cities: readonly string[], selected: readonly string[], q: string): string[] {
  const t = q.trim();
  return t ? cities.filter((c) => !selected.includes(c) && c.includes(t)).slice(0, 8) : [];
}
/** בניינים לפי שם או עיר (לפחות 2 תווים) — עד 8. */
export function buildingMatches(buildings: readonly AdBuildingOption[], selected: readonly string[], q: string): AdBuildingOption[] {
  const t = q.trim();
  return t.length >= 2 ? buildings.filter((b) => !selected.includes(b.id) && `${b.name} ${b.city ?? ""}`.includes(t)).slice(0, 8) : [];
}

export function ReachGauge({ state }: { state: ReachState }) {
  const tone = state.kind === "ok" ? (state.under10 ? "var(--yellow)" : "var(--green)") : state.kind === "failed" ? "var(--yellow)" : "var(--text-2)";
  return (
    <div role="status" aria-live="polite" data-reach={state.kind} className="card"
      style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px 14px", borderColor: state.kind === "ok" ? "rgba(34,197,94,.35)" : undefined }}>
      <span aria-hidden="true" style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(59,130,246,.14)", color: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Users size={20} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <span style={{ fontSize: "12.5px", color: "var(--text-2)" }}>הקהל המשוער</span>
        <span className="studio-num" style={{ fontSize: "16px", fontWeight: 800, color: tone }} data-reach-text="">{reachText(state) || "—"}</span>
        {state.kind === "ok" && <span style={{ fontSize: "11.5px", color: "var(--text-3)", lineHeight: 1.45 }} data-reach-help="">הערכה לפי הקהל שנבחר, לפני כללי התדירות והתזמון. {ESTIMATE_K_TEXT}</span>}
      </span>
    </div>
  );
}

/** מד הקהל: בקשה אחת, 600ms אחרי השינוי האחרון; תשובה ישנה לא דורסת חדשה. */
export function useReach(a: AudienceValue, enabled = true): ReachState {
  // the first paint already says "מעריכים…" (the effect asks right away) — not a bare "—" that reads like "no audience"
  const [s, setS] = useState<ReachState>(() => (enabled ? { kind: "loading" } : { kind: "idle" }));
  const body = JSON.stringify(estimateBody(a));
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setS({ kind: "loading" });
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/ads/estimate", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body });
        const j = await r.json().catch(() => null);
        if (alive) setS(estimateAnswer(r.status, j));
      } catch {
        if (alive) setS({ kind: "failed" });
      }
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [body, enabled]);
  return s;
}

export interface AudienceEditorViewProps {
  value: AudienceValue; onChange: (v: AudienceValue) => void; cities: string[]; buildings: AdBuildingOption[]; disabled?: boolean;
  cityQ: string; onCityQ: (q: string) => void; bq: string; onBq: (q: string) => void; reach: ReachState | null;
}

export function AudienceEditorView({ value: v, onChange, cities, buildings, disabled = false, cityQ, onCityQ, bq, onBq, reach }: AudienceEditorViewProps) {
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const cm = cityMatches(cities, v.cities, cityQ);
  const bm = buildingMatches(buildings, v.building_ids, bq);
  const warn = screensWarning(v.screens);
  return (
    <fieldset disabled={disabled} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }} data-audience-editor="">
      {reach && <ReachGauge state={reach} />}
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }} data-audience-summary="">{audienceSummary({ ...v, days: [0, 1, 2, 3, 4, 5, 6], hour_from: 0, hour_to: 24 }).replace(", כל הימים, כל השעות.", ".")}</p>
      <ChipSet name="screens" label="באילו מסכים" value={v.screens} onChange={(screens) => onChange({ ...v, screens })} allLabel="כל המסכים"
        options={SCREENS.map((s) => ({ key: s, label: SCREEN_LABEL[s] }))} />
      {warn && <Banner tone="warn"><span data-audience-screens-warning="">{warn}</span></Banner>}
      <ChipSet name="plans" label="מסלולים" value={v.plans} onChange={(plans) => onChange({ ...v, plans })} allLabel="כל המסלולים"
        options={AD_PLANS.map((p) => ({ key: p, label: PLAN_LABEL[p] }))}
        hint="ברירת המחדל: התנסות ו-Core. מסלול בתשלום גבוה יותר מקבל פרסומות רק כשמסמנים אותו כאן. בניין שחברת ניהול מנהלת נחשב Pro." />
      <ChipSet name="roles" label="קהל" value={v.roles} onChange={(roles) => onChange({ ...v, roles })} allLabel="כולם"
        options={AD_ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] }))} />

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-audience-cities={v.cities.length}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>ערים {v.cities.length ? "" : "(כל הערים)"}</span>
        {v.cities.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {v.cities.map((c) => (
              <span key={c} style={pill}>{c}
                <button type="button" aria-label={`הסרת ${c}`} style={pillX} onClick={() => onChange({ ...v, cities: v.cities.filter((x) => x !== c) })} data-city-remove={c}><X size={14} /></button>
              </span>
            ))}
          </div>
        )}
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
          <input value={cityQ} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onCityQ(e.target.value)} placeholder="הוספת עיר" aria-label="הוספת עיר"
            style={{ ...inputStyle, paddingRight: "36px" }} data-audience-city-search="" autoComplete="off" />
        </div>
        {cm.length > 0 && (
          <div role="listbox" aria-label="ערים" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {cm.map((c) => <button key={c} type="button" role="option" aria-selected={false} style={ghostBtn} data-city-option={c} onClick={() => { onChange({ ...v, cities: [...v.cities, c] }); onCityQ(""); }}>{c}</button>)}
          </div>
        )}
        {cityQ.trim() && cm.length === 0 && <span style={{ fontSize: "13px", color: "var(--text-3)" }}>אין עיר כזו בבניינים של bloc.</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-audience-buildings={v.building_ids.length}>
        <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>בניינים מסוימים {v.building_ids.length ? "" : "(כל הבניינים)"}</span>
        {v.building_ids.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {v.building_ids.map((id) => (
              <span key={id} style={pill}>{byId.get(id)?.name ?? "בניין שנמחק"}
                <button type="button" aria-label="הסרה" style={pillX} onClick={() => onChange({ ...v, building_ids: v.building_ids.filter((x) => x !== id) })} data-building-remove={id}><X size={14} /></button>
              </span>
            ))}
          </div>
        )}
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
          <input value={bq} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onBq(e.target.value)} placeholder="חיפוש בניין לפי שם או עיר" aria-label="חיפוש בניין"
            style={{ ...inputStyle, paddingRight: "36px" }} data-audience-building-search="" autoComplete="off" />
        </div>
        {bm.length > 0 && (
          <div role="listbox" aria-label="בניינים" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {bm.map((b) => (
              <button key={b.id} type="button" role="option" aria-selected={false} style={{ ...ghostBtn, justifyContent: "flex-start" }} data-building-option={b.id}
                onClick={() => { onChange({ ...v, building_ids: [...v.building_ids, b.id] }); onBq(""); }}>
                {b.name}{b.city ? <span style={{ color: "var(--text-2)" }}> {b.city}</span> : null}
              </button>
            ))}
          </div>
        )}
        {v.cities.length > 0 && v.building_ids.length > 0 && (
          <span style={{ fontSize: "12.5px", color: "var(--text-3)" }} data-audience-both="">
            גם ערים וגם בניינים: מוצג רק בבניינים שנבחרו שנמצאים בערים שנבחרו ({fmtInt(v.building_ids.filter((id) => { const b = byId.get(id); return !!b?.city && v.cities.includes(b.city); }).length)} כאלה).
          </span>
        )}
      </div>
    </fieldset>
  );
}

export default function AudienceEditor(p: Omit<AudienceEditorViewProps, "cityQ" | "onCityQ" | "bq" | "onBq">) {
  const [cityQ, setCityQ] = useState("");
  const [bq, setBq] = useState("");
  return <AudienceEditorView {...p} cityQ={cityQ} onCityQ={setCityQ} bq={bq} onBq={setBq} />;
}

const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 4px 4px 12px", borderRadius: "99px", border: "1px solid var(--border)", fontSize: "14px", color: "var(--text)" };
const pillX: React.CSSProperties = { width: "44px", height: "44px", margin: "-8px -6px -8px -8px", borderRadius: "50%", border: "none", background: "transparent", color: "var(--text-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" };
