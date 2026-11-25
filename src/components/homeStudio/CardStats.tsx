"use client";
// homeStudio/CardStats — הספירות של כרטיס (bloc HOME-STUDIO-1, החלטות 689, 694): 30 הימים האחרונים בשעון ישראל — צפיות (חצי מהכרטיס
// על המסך שנייה רצופה, פעם אחת בטעינה), לחיצות, אחוז לחיצה, סגירות, ובערימה — כמה כרטיסים בממוצע לכל צפייה ומי הגיע לסוף. ספירות
// בלבד, בלי מי (אין ניתוח לפי משתמש). כשל — במשפט, אף פעם לא אפסים.
import { useCallback, useEffect, useState } from "react";
import { Banner, ghostBtn } from "@/components/ui/panelKit";
import { KpiTile, Sheet, STUDIO_CSS } from "@/components/ads/studio/kit";
import { fmtInt } from "@/lib/ads";
import { ilTodayKey } from "@/lib/broadcasts";
import { SHAPE_INFO, fillDays, parseStats, statsSummary, sumDays, type DayStats, type StudioCard } from "@/lib/homeStudio";
import { postStudio, hintText } from "./hsKit";

type State = { phase: "loading" } | { phase: "failed"; error: string } | { phase: "ok"; days: DayStats[] };

export function StatsView({ card, days, today }: { card: Pick<StudioCard, "shape" | "name">; days: DayStats[]; today: string }) {
  const t = sumDays(days);
  const s = statsSummary(t, card.shape);
  const all = fillDays(days, today, 30);
  const max = Math.max(1, ...all.map((d) => d.views));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-hs-stats="">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap: "8px" }}>
        <KpiTile label="צפיות" value={fmtInt(t.views)} testId="views" sub="חצי מהכרטיס על המסך שנייה" />
        <KpiTile label="לחיצות" value={fmtInt(t.taps)} testId="taps" />
        <KpiTile label="אחוז לחיצה" value={s.ctr} testId="ctr" sub="לחיצות מתוך צפיות" />
        <KpiTile label="סגירות (X)" value={fmtInt(t.closes)} testId="closes" />
        {s.depth !== null && <KpiTile label="כרטיסים לצפייה" value={s.depth} testId="depth" sub="כמה כרטיסים בערימה, בממוצע" />}
        {s.ended !== null && <KpiTile label="הגיעו לסוף" value={s.ended} testId="ended" sub="מתוך הצפיות" />}
      </div>
      <div>
        <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginBottom: "6px" }}>צפיות ביום, 30 הימים האחרונים</div>
        <div role="img" aria-label={`צפיות ביום: ${all.filter((d) => d.views > 0).length} ימים עם צפיות`} data-hs-bars=""
          style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "96px", padding: "6px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)" }}>
          {all.map((d) => (
            <span key={d.day} title={`${d.day.split("-").reverse().join("/")}: ${fmtInt(d.views)} צפיות, ${fmtInt(d.taps)} לחיצות`} data-hs-bar={d.day}
              style={{ flex: 1, minWidth: 0, height: `${Math.max(d.views ? 6 : 2, Math.round((d.views / max) * 84))}px`, borderRadius: "3px 3px 0 0", background: d.views ? "var(--blue)" : "var(--border)" }} />
          ))}
        </div>
      </div>
      <span style={hintText}>ספירות בלבד, בלי מי ראה או לחץ. {SHAPE_INFO[card.shape].label}.</span>
    </div>
  );
}

export default function CardStats({ card, onClose }: { card: StudioCard; onClose: () => void }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const r = await postStudio<{ days: unknown }>({ action: "card.stats", id: card.id });
    if (!r.ok) { setState({ phase: "failed", error: r.error }); return; }
    const days = parseStats({ ok: true, days: r.data.days });
    setState(days ? { phase: "ok", days } : { phase: "failed", error: "התשובה לא בצורה המוכרת. נסו שוב." });
  }, [card.id]);
  useEffect(() => { void load(); }, [load]);
  return (
    <Sheet title={`ספירות: ${card.name}`} onClose={onClose} testId="hs-stats">
      <style>{STUDIO_CSS}</style>
      {state.phase === "loading" && <div style={{ ...hintText, padding: "24px 0", textAlign: "center" }} aria-busy="true" data-hs-stats-loading="">טוענים…</div>}
      {state.phase === "failed" && <Banner tone="error" action={<button type="button" style={ghostBtn} onClick={() => void load()}>נסו שוב</button>}>{state.error}</Banner>}
      {state.phase === "ok" && <StatsView card={card} days={state.days} today={ilTodayKey()} />}
    </Sheet>
  );
}
