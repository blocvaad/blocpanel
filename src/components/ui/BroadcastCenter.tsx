"use client";
// BroadcastCenter — מסך "הודעות לבניינים" (bloc UI-R5a): הודעה חדשה, מה שמוצג עכשיו, ומה שהסתיים.
// הרשימה נטענת פעם אחת לשלוש הלשוניות (המספרים בלשוניות), ומתרעננת אחרי שליחה ואחרי כל פעולה.
// כשל בטעינה — הודעה עם "ניסיון נוסף", לעולם לא "אין הודעות".
import { useCallback, useEffect, useRef, useState } from "react";
import BroadcastForm, { type BroadcastBuilding } from "./BroadcastForm";
import SentBroadcasts, { SentLoadError, type SentLoaded } from "./SentBroadcasts";
import { Banner, ghostBtn } from "./broadcastKit";

type Tab = "new" | "active" | "ended";

export default function BroadcastCenter({ buildings, configured, buildingsError }: {
  buildings: BroadcastBuilding[];
  configured: boolean;
  buildingsError: boolean;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [data, setData] = useState<SentLoaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // טעינה שהתחילה מאוחר יותר — היא שקובעת (תשובה ישנה שמגיעה אחריה לא דורסת).
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true); setError(null);
    let next: SentLoaded | null = null;
    let failed: string | null = null;
    try {
      const r = await fetch("/api/broadcast", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) failed = j.error ?? "טעינת ההודעות שנשלחו נכשלה. נסו שוב.";
      else next = j as SentLoaded;
    } catch {
      failed = "אין חיבור לשרת. בדקו את החיבור ונסו שוב.";
    }
    if (n !== seq.current) return;
    if (next) setData(next); else setError(failed);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // קישור ישיר: /broadcast?tab=active / ended — בלי useSearchParams (לא דורש Suspense).
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "active" || t === "ended") setTab(t);
  }, [load]);

  const go = (t: Tab) => {
    setTab(t);
    const url = t === "new" ? window.location.pathname : `${window.location.pathname}?tab=${t}`;
    window.history.replaceState(null, "", url);
  };

  const activeN = data?.broadcasts.filter((x) => x.state !== "ended").length ?? null;
  const endedN = data?.broadcasts.filter((x) => x.state === "ended").length ?? null;
  const TABS: { key: Tab; label: string }[] = [
    { key: "new", label: "הודעה חדשה" },
    { key: "active", label: activeN === null ? "מוצגות עכשיו" : `מוצגות עכשיו (${activeN})` },
    { key: "ended", label: endedN === null ? "הסתיימו" : `הסתיימו (${endedN})` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div className="chips" role="tablist" aria-label="הודעות לבניינים" style={{ gap: "6px" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-tab={t.key}
            className={`chip${tab === t.key ? " active" : ""}`} onClick={() => go(t.key)} style={{ minHeight: "44px", ...(tab === t.key ? {} : { color: "var(--text-2)" }) }}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <Banner tone="ok" action={<button type="button" style={ghostBtn} onClick={() => setNotice(null)}>סגירה</button>}>
          <span data-broadcast-notice="">{notice}</span>
        </Banner>
      )}

      {/* הטופס נשאר טעון גם בלשוניות האחרות — טיוטה, תוצאת שליחה ו"המשך השליחה" לא נעלמים במעבר. */}
      <div style={{ display: tab === "new" ? "flex" : "none", flexDirection: "column", gap: "14px" }} data-tab-panel="new">
        {buildingsError && <Banner tone="error">טעינת רשימת הבניינים נכשלה. רעננו את הדף לפני שליחה לבניינים נבחרים.</Banner>}
        {!configured && <Banner tone="warn">השליחה לא זמינה: ב-Vercel של הפאנל חסרים BLOC_APP_URL ו/או PANEL_ACTION_SECRET (אותו ערך כמו ב-bloc).</Banner>}
        <BroadcastForm buildings={buildings} configured={configured} onSent={() => void load()} />
      </div>

      {tab !== "new" && (
        error ? <SentLoadError error={error} onRetry={() => void load()} /> :
        !data ? <div className="card" style={{ padding: "24px", color: "var(--text-2)", fontSize: "14.5px" }} aria-busy="true">טוענים את ההודעות…</div> :
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }} aria-busy={loading}>
          <SentBroadcasts data={data} view={tab} onChanged={() => void load()} onNotice={setNotice} />
        </div>
      )}
    </div>
  );
}
