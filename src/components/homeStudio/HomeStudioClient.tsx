"use client";
// homeStudio/HomeStudioClient — המסך "מסך הבית" (bloc HOME-STUDIO-1, החלטות 684–694): כרטיסים של bloc במסך הבית של הדיירים והוועד.
//   • המתג: "הכרטיסים מוצגים במסך הבית" — כבוי מסתיר את כולם מיד (690), עם שאלה לפני.
//   • מפת מסך הבית: השורות לפי הסדר, ובין כל שתיים — מה שמתוכנן שם, ו"+ כאן" שפותח כרטיס חדש במקום הזה.
//   • הרשימה: מצב, תוקף ("הסתיים" / "נגמר בעוד N ימים"), 7 ימים של צפיות ואחוז לחיצה; עריכה, שכפול וספירות.
//   • אזהרה כשיותר מ-2 כרטיסים פעילים (687: במסך בית אחד מוצגים עד 2, לפי הסדר במסך).
//   • "מה חדש ב-bloc" — לשונית משלו. קריאה שנכשלה — במשפט עם "נסו שוב", אף פעם לא "אין כרטיסים"; לפני SQL 256 — אומר את זה.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, BarChart3, Copy, Pencil, RefreshCw } from "lucide-react";
import { Banner, Tag, ghostBtn, solidBtn } from "@/components/ui/panelKit";
import { Toggle } from "@/components/ui/broadcastKit";
import { ScrollTabs, Sheet, STUDIO_CSS } from "@/components/ads/studio/kit";
import { fmtInt } from "@/lib/ads";
import {
  HOME_MAP, SHAPE_INFO, SLOT_LABEL, STATUS_LABEL, STATUS_TONE, STUDIO_CAP, STUDIO_TEMPLATES, ZERO, formFromCard, formFromTemplate, liveCount,
  liveNow, parseCard, parseStudioList, pct, slotCards, validity,
  type CardForm, type StudioCard, type StudioListData, type StudioSlot, type StudioStatus, type StudioUpdate,
} from "@/lib/homeStudio";
import CardEditor from "./CardEditor";
import CardStats from "./CardStats";
import UpdatesPanel from "./UpdatesPanel";
import { ShapeGlyph, postStudio, hintText } from "./hsKit";

export type HsState = { phase: "loading" } | { phase: "failed"; error: string } | { phase: "missing" } | ({ phase: "ok" } & StudioListData);

/** התשובה של GET /api/home-studio → המצב של המסך (כשל — המשפט; לפני 256 — missing; צורה לא מוכרת — failed). */
export function stateFromReply(status: number, body: unknown): HsState {
  const j = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (j?.state === "missing") return { phase: "missing" };
  if (status >= 400 || !j) return { phase: "failed", error: j && typeof j.message === "string" ? j.message : j && typeof j.error === "string" ? j.error : "הקריאה נכשלה. נסו שוב." };
  const list = j.state === "ok" ? parseStudioList({ ...j, ok: true }) : null;
  // the server already left out what this panel does not know (unknown) — added to anything left out here
  const prior = typeof j.unknown === "number" && Number.isInteger(j.unknown) && j.unknown > 0 ? j.unknown : 0;
  return list ? { phase: "ok", ...list, unknown: list.unknown + prior } : { phase: "failed", error: "התשובה לא בצורה המוכרת. רעננו את הדף." };
}

type Filter = "all" | "live" | "draft" | "test" | "paused" | "archived";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "הכל" }, { key: "live", label: "פורסמו" }, { key: "draft", label: "טיוטות" }, { key: "test", label: "בבדיקה" },
  { key: "paused", label: "מושהים" }, { key: "archived", label: "בארכיון" },
];
const pass = (f: Filter, s: StudioStatus) => (f === "all" ? s !== "archived" : f === s);

export function CardRow({ c, totals, now, canManage, onEdit, onStats, onDuplicate, busy }: {
  c: StudioCard; totals: StudioListData["totals"][string] | undefined; now: Date; canManage: boolean
  onEdit: () => void; onStats: () => void; onDuplicate: () => void; busy: boolean
}) {
  const v = validity(c, now);
  const t = totals ?? ZERO;
  return (
    <div className="card-sm" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }} data-hs-card={c.id} data-hs-card-status={c.status}>
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <ShapeGlyph shape={c.shape} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "15px", fontWeight: 700 }}>{c.name}</span>
            <Tag tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Tag>
            {v && <Tag tone={v.tone === "info" ? "info" : v.tone === "wait" ? "wait" : "muted"}>{v.text}</Tag>}
            {c.source === "whats_new" && <Tag tone="info">מה חדש</Tag>}
          </span>
          <span style={hintText}>{SHAPE_INFO[c.shape].label} · {SLOT_LABEL[c.slot]} · {c.audience.roles.map((r) => (r === "vaad" ? "ועד" : "דיירים")).join(" ו")}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "13px", color: "var(--text-2)" }} data-hs-week="">
        <span>7 ימים:</span>
        <span className="studio-num"><b style={{ color: "var(--text)" }}>{fmtInt(t.views)}</b> צפיות</span>
        <span className="studio-num"><b style={{ color: "var(--text)" }}>{fmtInt(t.taps)}</b> לחיצות</span>
        <span className="studio-num"><b style={{ color: "var(--text)" }}>{pct(t.taps, t.views)}</b> אחוז לחיצה</span>
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button type="button" onClick={onEdit} style={ghostBtn} data-hs-edit=""><Pencil size={15} /> {canManage && c.status !== "archived" ? "עריכה" : "פתיחה"}</button>
        <button type="button" onClick={onStats} style={ghostBtn} data-hs-open-stats=""><BarChart3 size={15} /> ספירות</button>
        {canManage && <button type="button" onClick={onDuplicate} disabled={busy} style={ghostBtn} data-hs-row-duplicate=""><Copy size={15} /> שכפול</button>}
      </div>
    </div>
  );
}

export function TemplatePicker({ slot, onPick, onClose }: { slot: StudioSlot | null; onPick: (key: string | null) => void; onClose: () => void }) {
  return (
    <Sheet title={slot ? `כרטיס חדש ${SLOT_LABEL[slot]}` : "כרטיס חדש"} onClose={onClose} testId="hs-templates">
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>מתחילים מתבנית ומשנים הכל, או מכרטיס ריק. כרטיס חדש נשמר כטיוטה: שום דבר לא מוצג עד שמפרסמים.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))", gap: "8px" }}>
        {STUDIO_TEMPLATES.map((t) => (
          <button key={t.key} type="button" onClick={() => onPick(t.key)} data-hs-template={t.key} className="card-sm"
            style={{ display: "flex", gap: "10px", alignItems: "center", padding: "12px", textAlign: "start", fontFamily: "inherit", color: "var(--text)", minHeight: "64px" }}>
            <ShapeGlyph shape={t.shape} size={32} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "14.5px", fontWeight: 700 }}>{t.label}</span>
              <span style={{ display: "block", ...hintText }}>{t.hint}</span>
            </span>
          </button>
        ))}
        <button type="button" onClick={() => onPick(null)} data-hs-template="blank" className="card-sm"
          style={{ display: "flex", gap: "10px", alignItems: "center", padding: "12px", textAlign: "start", fontFamily: "inherit", color: "var(--text)", minHeight: "64px", borderStyle: "dashed" }}>
          <Plus size={28} color="#71717a" />
          <span><span style={{ display: "block", fontSize: "14.5px", fontWeight: 700 }}>כרטיס ריק</span><span style={{ display: "block", ...hintText }}>מלבן אחד, ממלאים לבד</span></span>
        </button>
      </div>
    </Sheet>
  );
}

export function HomeMap({ cards, now, canManage, onAdd, onOpen }: { cards: StudioCard[]; now: Date; canManage: boolean; onAdd: (slot: StudioSlot) => void; onOpen: (c: StudioCard) => void }) {
  const zone = (slot: StudioSlot) => {
    const here = slotCards(cards, slot);
    return (
      <div data-hs-zone={slot} style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", padding: "6px 10px", borderInlineStart: `3px solid ${here.length ? "var(--blue)" : "var(--border)"}`, marginInlineStart: "10px" }}>
        {here.map((c) => (
          <button key={c.id} type="button" onClick={() => onOpen(c)} data-hs-zone-card={c.id}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "36px", padding: "0 10px", borderRadius: "99px", fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
              border: `1px solid ${liveNow(c, now) ? "rgba(34,197,94,.6)" : "var(--border)"}`, background: liveNow(c, now) ? "rgba(34,197,94,.10)" : "transparent", color: "var(--text)" }}>
            <ShapeGlyph shape={c.shape} size={16} color={liveNow(c, now) ? "#22c55e" : "#a1a1aa"} />{c.name}
            <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{STATUS_LABEL[c.status]}</span>
          </button>
        ))}
        {canManage && (
          <button type="button" onClick={() => onAdd(slot)} data-hs-add={slot} aria-label={`כרטיס חדש ${SLOT_LABEL[slot]}`}
            style={{ minHeight: "36px", padding: "0 12px", borderRadius: "99px", border: "1px dashed var(--border-2)", background: "transparent", color: "var(--blue)", fontSize: "13px", fontWeight: 700, fontFamily: "inherit" }}>
            + כאן
          </button>
        )}
      </div>
    );
  };
  const row = (label: string, key: string) => (
    <div data-hs-map-row={key} style={{ padding: "8px 12px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)", fontSize: "13.5px", color: "var(--text-2)" }}>{label}</div>
  );
  return (
    <section className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "6px" }} aria-label="המפה של מסך הבית" data-hs-map="">
      <h2 style={{ fontSize: "15.5px", fontWeight: 700 }}>המפה של מסך הבית</h2>
      <p style={{ ...hintText, marginBottom: "4px" }}>השורות של מסך הבית לפי הסדר. כרטיס נכנס בין שתי שורות, בלי לשנות אף שורה קיימת. בירוק: מוצג עכשיו.</p>
      {HOME_MAP.map((r) => (
        <div key={r.slot} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {row(r.row, r.slot)}
          {zone(r.slot)}
        </div>
      ))}
      {row("סוף המסך (לפני שורת החירום)", "end")}
      {zone("end")}
    </section>
  );
}

/** initial — מצב התחלתי (לתצוגה מוכנה מראש ולבדיקות); הקריאה ל-/api/home-studio רצה בכל מקרה ומחליפה אותו. */
export default function HomeStudioClient({ canManage, myEmail, initial }: { canManage: boolean; myEmail: string; initial?: HsState }) {
  const [state, setState] = useState<HsState>(initial ?? { phase: "loading" });
  const [tab, setTab] = useState<"cards" | "updates">("cards");
  const [filter, setFilter] = useState<Filter>("all");
  const [picker, setPicker] = useState<{ slot: StudioSlot | null } | null>(null);
  const [editor, setEditor] = useState<{ form: CardForm; card: StudioCard | null; key: number } | null>(null);
  const [stats, setStats] = useState<StudioCard | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [askOff, setAskOff] = useState(false);
  const [busy, setBusy] = useState(false);
  // שכפול שלא ברור אם בוצע — "שכפול" נעול עד רענון, כדי שלא ייווצר עותק שני (סקירה #21; כמו העורך)
  const [stale, setStale] = useState(false);
  const now = useMemo(() => new Date(), [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/home-studio", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => null);
      const next = stateFromReply(r.status, j);
      setState(next);
      if (next.phase === "ok") setStale(false);
    } catch {
      setState({ phase: "failed", error: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const upsertCard = (c: StudioCard) => setState((s) => (s.phase !== "ok" ? s : { ...s, cards: [c, ...s.cards.filter((x) => x.id !== c.id)] }));
  const upsertUpdate = (u: StudioUpdate) => setState((s) => (s.phase !== "ok" ? s : { ...s, updates: [u, ...s.updates.filter((x) => x.id !== u.id)] }));

  async function setSwitch(enabled: boolean) {
    setBusy(true); setNote(null);
    const r = await postStudio<{ enabled: boolean; changed: boolean }>({ action: "switch", enabled });
    setBusy(false); setAskOff(false);
    if (!r.ok) { setNote({ tone: r.unclear ? "warn" : "error", text: r.error }); return; }
    setState((s) => (s.phase !== "ok" ? s : { ...s, enabled: r.data.enabled }));
    setNote({ tone: "ok", text: r.data.enabled ? "הכרטיסים חזרו למסך הבית." : "כל הכרטיסים הוסתרו ממסך הבית." });
  }
  async function duplicate(c: StudioCard) {
    setBusy(true); setNote(null);
    const r = await postStudio<{ card: unknown }>({ action: "card.duplicate", id: c.id });
    setBusy(false);
    if (!r.ok) {
      if (r.unclear) setStale(true);
      setNote({ tone: r.unclear ? "warn" : "error", text: r.unclear ? `${r.error} (בדקו שהעותק לא נוצר פעמיים.)` : r.error });
      return;
    }
    const n = parseCard(r.data.card);
    if (!n) { setStale(true); setNote({ tone: "warn", text: "התשובה לא ברורה. רעננו את הדף ובדקו אם העותק נוצר." }); return; }
    upsertCard(n);
    setNote({ tone: "ok", text: `נוצר עותק כטיוטה: ${n.name}.` });
  }

  if (state.phase === "loading") return <div className="card" style={{ padding: "24px", textAlign: "center", color: "var(--text-2)" }} aria-busy="true" data-hs-loading="">טוענים את מסך הבית…</div>;
  if (state.phase === "missing") return <Banner tone="info">המסך מוכן, אבל ב-bloc עוד לא הורץ SQL 256. אחרי שהוא ירוץ, הכרטיסים יופיעו כאן.</Banner>;
  if (state.phase === "failed") return <Banner tone="error" action={<button type="button" style={ghostBtn} onClick={() => { setState({ phase: "loading" }); void load(); }} data-hs-retry=""><RefreshCw size={15} /> נסו שוב</button>}>{state.error}</Banner>;

  const live = liveCount(state.cards, now);
  const list = state.cards.filter((c) => pass(filter, c.status));
  const counts = (f: Filter) => state.cards.filter((c) => pass(f, c.status)).length;
  const openCard = (c: StudioCard) => setEditor({ form: formFromCard(c), card: c, key: Date.now() });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-hs-screen="">
      <style>{STUDIO_CSS}</style>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800 }}>מסך הבית</h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.6 }}>
          כרטיסים של bloc במסך הבית של הדיירים והוועד: שש צורות, בכל מקום בין השורות, לפי קהל ותאריכים. שום דבר לא מוצג עד שמפרסמים, והוועד וחברת הניהול לא רואים את הניהול.
        </p>
      </div>
      {state.unknown > 0 && <Banner tone="warn">{state.unknown === 1 ? "פריט אחד מ-bloc לא מוצג כאן, כי הפאנל לא מכיר את הצורה שלו." : `${state.unknown} פריטים מ-bloc לא מוצגים כאן, כי הפאנל לא מכיר את הצורה שלהם.`} עדכנו את הפאנל לגרסה האחרונה.</Banner>}
      {note && <Banner tone={note.tone}>{note.text}</Banner>}

      <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }} data-hs-switch={state.enabled ? "on" : "off"}>
        {canManage ? (
          <Toggle name="hs-enabled" checked={state.enabled} label="הכרטיסים מוצגים במסך הבית"
            hint={state.enabled ? "כיבוי מסתיר מיד את כל הכרטיסים מכל הטלפונים (גם את מה שבבדיקה)." : "כרגע כל הכרטיסים מוסתרים. הדלקה מחזירה את מה שמפורסם."}
            onChange={(on) => { if (!on) setAskOff(true); else void setSwitch(true); }} />
        ) : (
          <span style={{ fontSize: "14.5px", fontWeight: 600 }}>{state.enabled ? "הכרטיסים מוצגים במסך הבית" : "כל הכרטיסים מוסתרים כרגע"}</span>
        )}
        {askOff && (
          <div role="alertdialog" aria-label="להסתיר את כל הכרטיסים?" data-hs-ask-off="" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, flex: "1 1 100%" }}>להסתיר עכשיו את כל הכרטיסים ממסך הבית של כולם?</span>
            <button type="button" disabled={busy} onClick={() => void setSwitch(false)} style={solidBtn("var(--red)")} data-hs-off-yes="">כן, להסתיר הכל</button>
            <button type="button" onClick={() => setAskOff(false)} style={ghostBtn} data-hs-off-no="">ביטול</button>
          </div>
        )}
      </div>

      <ScrollTabs<"cards" | "updates"> label="מה מנהלים" testId="hs-tabs" value={tab} onChange={setTab}
        tabs={[{ key: "cards", label: "כרטיסים", count: counts("all") }, { key: "updates", label: "מה חדש ב-bloc", count: state.updates.filter((u) => u.status === "live").length }]} />

      {tab === "cards" && (
        <>
          {live > STUDIO_CAP && <Banner tone="warn">יש {live} כרטיסים שמוצגים עכשיו. במסך בית אחד מוצגים עד {STUDIO_CAP} (לפי הסדר במסך), ולכן חלק מהם לא ייראו אצל מי שבשני הקהלים.</Banner>}
          {canManage && <button type="button" onClick={() => setPicker({ slot: null })} style={{ ...solidBtn("var(--blue)"), alignSelf: "flex-start" }} data-hs-new=""><Plus size={16} /> כרטיס חדש</button>}
          <HomeMap cards={state.cards} now={now} canManage={canManage} onAdd={(slot) => setPicker({ slot })} onOpen={openCard} />
          <section style={{ display: "flex", flexDirection: "column", gap: "10px" }} aria-label="כל הכרטיסים">
            <ScrollTabs<Filter> label="סינון" testId="hs-filter" value={filter} onChange={setFilter} tabs={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts(f.key) }))} />
            {list.length === 0
              ? <div className="card-sm" style={{ padding: "18px", textAlign: "center", fontSize: "14px", color: "var(--text-2)" }} data-hs-empty="">
                  {state.cards.length === 0 ? "עוד אין כרטיסים. מתחילים ב\"כרטיס חדש\" או ב\"+ כאן\" במפה." : "אין כרטיסים בסינון הזה."}
                </div>
              : list.map((c) => (
                <CardRow key={c.id} c={c} totals={state.totals[c.id]} now={now} canManage={canManage} busy={busy || stale}
                  onEdit={() => openCard(c)} onStats={() => setStats(c)} onDuplicate={() => void duplicate(c)} />
              ))}
          </section>
        </>
      )}
      {tab === "updates" && (
        <UpdatesPanel updates={state.updates} canManage={canManage} onRefresh={() => { setState({ phase: "loading" }); void load(); }}
          onChanged={(u, text) => { upsertUpdate(u); setNote({ tone: "ok", text }); }} />
      )}

      {picker && <TemplatePicker slot={picker.slot} onClose={() => setPicker(null)}
        onPick={(key) => { setEditor({ form: formFromTemplate(key, picker.slot), card: null, key: Date.now() }); setPicker(null); }} />}
      {editor && (
        <CardEditor key={editor.key} initial={editor.form} card={editor.card} updates={state.updates} canManage={canManage} myEmail={myEmail} now={now}
          onClose={() => setEditor(null)} onRefresh={() => { setEditor(null); setState({ phase: "loading" }); void load(); }}
          onChanged={(c, text) => { upsertCard(c); setNote({ tone: "ok", text }); }} />
      )}
      {stats && <CardStats card={stats} onClose={() => setStats(null)} />}
    </div>
  );
}
