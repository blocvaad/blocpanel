"use client";
// stories/StoriesQueue — המיתון של הסטורי (bloc STORIES-1, החלטות 439, 441; S345 — שלב 3, הסטורי לכל הבניינים). כאן: המתג הראשי
// (סופר-אדמין), הדיווחים של דיירים על פריט בסטורי (לפי פריט: כמה דיווחו ולמה, הראשון והאחרון, אף פעם לא מי), מה שצוות bloc
// הסתיר, הבניינים שהסטורי כבוי בהם (צוות bloc / הוועד) והפיילוט (רק כשהמתג הראשי כבוי). כל פעולה: אישור שאומר מה יקרה, ונשלחת ל-bloc
// החתום (/api/stories → internal/stories). הסתרה עם סיבה (3–300 תווים); "בדקנו, להשאיר"; החזרה; העברה לוועד (התראה לוועד על הפריט,
// בלי מי דיווח); כיבוי לבניין עם סיבה (גובר על הוועד). נכשל / ריק / חסר SQL: מצבים שונים. StoriesQueue: המצב והבקשה;
// StoriesQueueView: התצוגה (טהורה, לבדיקות ולצילומים).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye, ShieldCheck, Flag, RefreshCw, Send, Power } from "lucide-react";
import { Banner, Section, Tag, ghostBtn, solidBtn, fieldLabel, inputStyle } from "@/components/ui/panelKit";
import { STORY_SOURCE_LABEL, type StoryAction, type StoryHiddenRow, type StoryItem, type StoryPilotRow, type StoryReportGroup, type StorySwitchRow } from "@/lib/storiesPanel";
import type { StoriesQueueData } from "@/lib/storiesServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const STORIES_PRIVACY_TEXT = "מי דיווח לא מוצג כאן ולא נשלח לפאנל. הוועד רואה רק שפריט הוסתר, בלי מי ולמה.";
export const STORIES_EMPTY_TEXT = "אין דיווחים פתוחים.";
export const STORIES_FAILED_TEXT = "טעינת התור נכשלה, וזה לא אומר שאין דיווחים. נסו שוב.";
export const STORIES_SQL_MISSING_TEXT = "הסטורי עוד לא הותקן ב-bloc (SQL 235). אחרי ההתקנה רעננו.";

type Ask =
  | { kind: "hide"; g: StoryReportGroup }
  | { kind: "dismiss"; g: StoryReportGroup }
  | { kind: "refer"; g: StoryReportGroup }
  | { kind: "unhide"; h: StoryHiddenRow }
  | { kind: "pilot_off"; p: StoryPilotRow }
  | { kind: "global"; on: boolean }
  | { kind: "building_on"; s: StorySwitchRow };

/** מה יקרה — המשפט של האישור. */
export function askText(a: Ask): string {
  if (a.kind === "refer") return `הוועד של ${a.g.building} יקבל התראה על הפריט "${a.g.item.title}" (בלי מי דיווח), ויוכל לערוך או להסיר אותו. ${a.g.count === 1 ? "הדיווח ייסגר" : `${a.g.count} הדיווחים ייסגרו`} כ"הועבר לוועד".`;
  if (a.kind === "global") return a.on
    ? "הסטורי ייפתח בכל הבניינים, חוץ מבניינים שצוות bloc או הוועד כיבו. הוועד יכול לכבות לבניין שלו בהגדרות."
    : "הסטורי ייסגר בכל הבניינים: אף דייר לא יראה את השורה בבית, עד שפותחים שוב.";
  if (a.kind === "building_on") return `הסטורי יחזור ב${a.s.building}${a.s.committee_off ? ", אבל הוועד כיבה אותו בהגדרות, ולכן הוא יישאר כבוי עד שהוועד ידליק" : ""}.`;
  if (a.kind === "hide") return `הפריט "${a.g.item.title}" ייצא מהסטורי של ${a.g.building}, ו-${a.g.count === 1 ? "הדיווח עליו ייסגר" : `${a.g.count} הדיווחים עליו ייסגרו`}. ההודעה או המודעה עצמן לא משתנות.`;
  if (a.kind === "dismiss") return `${a.g.count === 1 ? "הדיווח ייסגר" : `${a.g.count} הדיווחים ייסגרו`} כ"נבדק", והפריט יישאר בסטורי של ${a.g.building}.`;
  if (a.kind === "unhide") return `הפריט "${a.h.item.title}" יחזור לסטורי של ${a.h.building}.`;
  return `הסטורי ייסגר ב${a.p.building}: הדיירים כבר לא יראו את השורה בבית.`;
}

function Item({ item }: { item: StoryItem }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", minWidth: 0 }}>
      <div style={{ width: "52px", height: "52px", borderRadius: "12px", overflow: "hidden", flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}
        data-story-thumb={item.photo ? "image" : "none"}>
        {item.photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <Flag size={20} color="var(--text-3)" aria-hidden="true" />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "15px", color: item.gone ? "var(--text-3)" : "var(--text-1)", overflowWrap: "anywhere" }}>{item.title}</div>
        {item.text && <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px", overflowWrap: "anywhere" }}>{item.text}</div>}
      </div>
    </div>
  );
}

export interface StoriesQueueViewProps {
  data: StoriesQueueData; canManage: boolean; canPilot: boolean; busy: boolean;
  ask: Ask | null; reason: string; error: string | null; done: string | null;
  pilotId: string; pilotNote: string;
  onAsk: (a: Ask) => void; onCancel: () => void; onConfirm: () => void; onReason: (v: string) => void; onRefresh: () => void;
  onPilotId: (v: string) => void; onPilotNote: (v: string) => void; onPilotOn: () => void;
  /** S345: כיבוי לבניין — המזהה והסיבה */
  offId?: string; offNote?: string; onOffId?: (v: string) => void; onOffNote?: (v: string) => void; onOff?: () => void;
}

/** S345: מה כתוב מתחת לכותרת — לפי המתג הראשי. */
export function storiesStateLine(platform: boolean | null): string {
  if (platform === null) return "המתג הראשי לא נקרא. רעננו את הדף.";
  return platform
    ? "הסטורי פתוח בכל הבניינים, חוץ מבניינים שצוות bloc או הוועד כיבו."
    : "הסטורי כבוי בכל הבניינים, ופתוח רק בבניינים שבפיילוט.";
}

export function StoriesQueueView(p: StoriesQueueViewProps) {
  const { data } = p;
  const head = (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 800 }}>סטורי - מיתון</h1>
      <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }} data-story-state="">{data.state === "ok" ? storiesStateLine(data.platform) : ""} {STORIES_PRIVACY_TEXT}</p>
    </div>
  );
  if (data.state === "missing") return <>{head}<Banner tone="warn">{STORIES_SQL_MISSING_TEXT}</Banner></>;
  if (data.state === "error") {
    return <>{head}<Banner tone="error" action={<button type="button" style={ghostBtn} onClick={p.onRefresh}><RefreshCw size={16} aria-hidden="true" /> נסו שוב</button>}>{STORIES_FAILED_TEXT}</Banner></>;
  }
  const confirmBox = (forKey: string) => p.ask && keyOf(p.ask) === forKey ? (
    <div data-story-confirm="" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: "14px" }}>{askText(p.ask)}</div>
      {p.ask.kind === "hide" && (
        <label style={fieldLabel}>למה מסתירים (נרשם ביומן; הוועד לא רואה)
          <input style={inputStyle} value={p.reason} maxLength={300} onChange={(e) => p.onReason(e.target.value)} data-story-reason="" />
        </label>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" style={solidBtn(p.ask.kind === "hide" || p.ask.kind === "pilot_off" || (p.ask.kind === "global" && !p.ask.on) ? "#dc2626" : "#1d4ed8")} disabled={p.busy || (p.ask.kind === "hide" && p.reason.trim().length < 3)}
          onClick={p.onConfirm} data-story-confirm-go="">{p.busy ? "שולחים…" : "אישור"}</button>
        <button type="button" style={ghostBtn} disabled={p.busy} onClick={p.onCancel}>ביטול</button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {head}
      {p.error && <Banner tone="error">{p.error}</Banner>}
      {p.done && <Banner tone="ok">{p.done}</Banner>}
      <Section title="המתג הראשי" hint="פתיחה וסגירה לכל הבניינים: סופר-אדמין בלבד. כל שינוי נרשם ביומן.">
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }} data-story-global={data.platform === null ? "unknown" : data.platform ? "on" : "off"}>
          <Tag tone={data.platform ? "ok" : data.platform === null ? "danger" : "muted"}>{data.platform === null ? "לא נקרא" : data.platform ? "פתוח לכל הבניינים" : "כבוי (פיילוט בלבד)"}</Tag>
          {p.canPilot && data.platform !== null && !p.ask && (
            <button type="button" style={data.platform ? ghostBtn : solidBtn("#1d4ed8")} onClick={() => p.onAsk({ kind: "global", on: !data.platform })} data-story-global-toggle="">
              <Power size={16} aria-hidden="true" /> {data.platform ? "לסגור בכל הבניינים" : "לפתוח לכל הבניינים"}
            </button>
          )}
        </div>
        {confirmBox("g")}
      </Section>
      <Section title={`דיווחים פתוחים${data.openTotal ? ` (${data.openTotal})` : ""}`} hint={data.truncated ? `מוצגים 300 הדיווחים האחרונים${data.openTotal ? ` מתוך ${data.openTotal}` : ""}.` : undefined}>
        {data.reports.length === 0 ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-story-empty="">{STORIES_EMPTY_TEXT}</div> : data.reports.map((g) => (
          <div key={g.key} data-story-report={g.source} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "14px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <Tag tone={g.count >= 3 ? "danger" : "wait"}>{g.count === 1 ? "דיווח אחד" : `${g.count} דיווחים`}</Tag>
              <Tag tone="muted">{STORY_SOURCE_LABEL[g.source]}</Tag>
              <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{g.building}</span>
            </div>
            <Item item={g.item} />
            <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>
              {g.reasons.map((r) => `${r.label}${r.count > 1 ? ` (${r.count})` : ""}`).join(" · ")} · האחרון {when(g.last)}
            </div>
            {p.canManage && !p.ask && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {!g.item.gone && <button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "hide", g })} data-story-hide=""><EyeOff size={16} aria-hidden="true" /> להסתיר מהסטורי</button>}
                <button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "dismiss", g })} data-story-dismiss=""><ShieldCheck size={16} aria-hidden="true" /> בדקנו, להשאיר</button>
                {!g.item.gone && <button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "refer", g })} data-story-refer=""><Send size={16} aria-hidden="true" /> להעביר לוועד</button>}
              </div>
            )}
            {confirmBox(`r:${g.key}`)}
          </div>
        ))}
      </Section>
      <Section title="מה הוסתר" hint={data.hiddenTruncated ? "מוצגים 200 האחרונים. פריט שהוסתר לא חוזר לסטורי עד שמחזירים אותו." : "פריט שהוסתר לא חוזר לסטורי עד שמחזירים אותו."}>
        {data.hidden.length === 0 ? <div style={{ color: "var(--text-2)", fontSize: "14px" }}>לא הוסתר כלום.</div> : data.hidden.map((h) => (
          <div key={`${h.building_id}:${h.source}:${h.source_id}`} data-story-hidden={h.source} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "14px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <Tag tone="muted">{STORY_SOURCE_LABEL[h.source]}</Tag>
              <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{h.building} · {when(h.created_at)}</span>
            </div>
            <Item item={h.item} />
            {h.reason && <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>הסיבה: {h.reason}</div>}
            {p.canManage && !p.ask && (
              <div><button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "unhide", h })} data-story-unhide=""><Eye size={16} aria-hidden="true" /> להחזיר לסטורי</button></div>
            )}
            {confirmBox(`h:${h.building_id}:${h.source}:${h.source_id}`)}
          </div>
        ))}
      </Section>
      <Section title="בניינים שהסטורי כבוי בהם" hint="צוות bloc גובר על הוועד. הוועד מכבה ומדליק לבניין שלו בהגדרות.">
        {data.switchesMissing ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-story-switches-missing="">המתג לבניין עוד לא הותקן ב-bloc (SQL 240).</div>
          : data.switchedOff.length === 0 ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-story-no-switched="">אין בניין שהסטורי כובה בו.</div>
          : data.switchedOff.map((w) => (
          <div key={w.building_id} data-story-switched={w.staff_off ? "staff" : "committee"} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "14px", border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700 }}>{w.building}</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {w.staff_off && <Tag tone="danger">כובה על ידי צוות bloc</Tag>}
              {w.committee_off && <Tag tone="muted">כובה על ידי הוועד</Tag>}
            </div>
            {w.staff_off && <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{w.staff_note ? `הסיבה: ${w.staff_note}` : ""}{w.staff_at ? ` · ${when(w.staff_at)}` : ""}</div>}
            {p.canManage && w.staff_off && !p.ask && <div><button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "building_on", s: w })} data-story-building-on="">להחזיר את הסטורי בבניין</button></div>}
            {confirmBox(`s:${w.building_id}`)}
          </div>
        ))}
        {p.canManage && !data.switchesMissing && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px" }} data-story-building-off="">
            <label style={fieldLabel}>מזהה הבניין (מדף הבניין)
              <input style={inputStyle} dir="ltr" value={p.offId ?? ""} onChange={(e) => p.onOffId?.(e.target.value.trim())} placeholder="00000000-0000-0000-0000-000000000000" />
            </label>
            <label style={fieldLabel}>למה מכבים (נרשם ביומן; הוועד רואה שכובה, בלי הסיבה)
              <input style={inputStyle} value={p.offNote ?? ""} maxLength={300} onChange={(e) => p.onOffNote?.(e.target.value)} />
            </label>
            <div><button type="button" style={solidBtn("#dc2626")} disabled={p.busy || !UUID.test(p.offId ?? "") || (p.offNote ?? "").trim().length < 3} onClick={p.onOff}>לכבות את הסטורי בבניין</button></div>
          </div>
        )}
      </Section>
      {data.platform === false && <Section title="בניינים בפיילוט" hint="כשהמתג הראשי כבוי, רק בהם הדיירים רואים את הסטורי.">
        {data.pilot.length === 0 ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-story-no-pilot="">אין בניינים בפיילוט, ולכן הסטורי כבוי בכל מקום.</div> : data.pilot.map((b) => (
          <div key={b.building_id} data-story-pilot="" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "14px", border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700 }}>{b.building}</div>
            <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>מ-{when(b.created_at)}{b.note ? ` · ${b.note}` : ""}</div>
            {p.canPilot && !p.ask && <div><button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "pilot_off", p: b })} data-story-pilot-off="">לסגור את הסטורי בבניין</button></div>}
            {confirmBox(`p:${b.building_id}`)}
          </div>
        ))}
        {p.canPilot && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px" }} data-story-pilot-on="">
            <label style={fieldLabel}>מזהה הבניין (מדף הבניין)
              <input style={inputStyle} dir="ltr" value={p.pilotId} onChange={(e) => p.onPilotId(e.target.value.trim())} placeholder="00000000-0000-0000-0000-000000000000" />
            </label>
            <label style={fieldLabel}>הערה (לא חובה)
              <input style={inputStyle} value={p.pilotNote} maxLength={300} onChange={(e) => p.onPilotNote(e.target.value)} />
            </label>
            <div><button type="button" style={solidBtn("#1d4ed8")} disabled={p.busy || !UUID.test(p.pilotId)} onClick={p.onPilotOn}>לפתוח את הסטורי בבניין</button></div>
          </div>
        )}
      </Section>}
    </>
  );
}

const keyOf = (a: Ask) => a.kind === "hide" || a.kind === "dismiss" || a.kind === "refer" ? `r:${a.g.key}`
  : a.kind === "unhide" ? `h:${a.h.building_id}:${a.h.source}:${a.h.source_id}`
  : a.kind === "global" ? "g" : a.kind === "building_on" ? `s:${a.s.building_id}` : `p:${a.p.building_id}`;

/** הגוף שנשלח לפאנל → bloc. */
export function actionBody(a: Ask, reason: string): StoryAction {
  if (a.kind === "hide") return { action: "hide", building_id: a.g.building_id, source: a.g.source, source_id: a.g.source_id, reason: reason.trim() };
  if (a.kind === "dismiss") return { action: "dismiss", building_id: a.g.building_id, source: a.g.source, source_id: a.g.source_id };
  if (a.kind === "unhide") return { action: "unhide", building_id: a.h.building_id, source: a.h.source, source_id: a.h.source_id };
  if (a.kind === "refer") return { action: "refer", building_id: a.g.building_id, source: a.g.source, source_id: a.g.source_id };
  if (a.kind === "global") return { action: a.on ? "global_on" : "global_off" };
  if (a.kind === "building_on") return { action: "building_on", building_id: a.s.building_id };
  return { action: "pilot_off", building_id: a.p.building_id };
}

/** S345: ההודעה אחרי הצלחה, לפי הפעולה. */
export function doneText(a: Ask): string {
  if (a.kind === "hide") return "הפריט הוסתר.";
  if (a.kind === "dismiss") return "הדיווחים נסגרו.";
  if (a.kind === "unhide") return "הפריט חזר לסטורי.";
  if (a.kind === "refer") return "הפריט הועבר לוועד, והדיווחים נסגרו.";
  if (a.kind === "global") return a.on ? "הסטורי נפתח לכל הבניינים." : "הסטורי נסגר בכל הבניינים.";
  if (a.kind === "building_on") return "הסטורי חזר בבניין.";
  return "הסטורי נסגר בבניין.";
}

async function postStories(body: StoryAction): Promise<{ ok: true; changed: boolean; closed: number | null } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/stories", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (r.ok && j?.ok === true && typeof j.changed === "boolean") return { ok: true, changed: j.changed, closed: typeof j.closed === "number" ? j.closed : null };
    return { ok: false, error: typeof j?.error === "string" ? j.error : "לא ברור אם הפעולה בוצעה. רעננו את הרשימה." };
  } catch {
    return { ok: false, error: "אין חיבור, ולא ברור אם הפעולה בוצעה. רעננו את הרשימה." };
  }
}

export default function StoriesQueue({ data, canManage, canPilot }: { data: StoriesQueueData; canManage: boolean; canPilot: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pilotId, setPilotId] = useState("");
  const [pilotNote, setPilotNote] = useState("");
  const [offId, setOffId] = useState("");
  const [offNote, setOffNote] = useState("");

  const send = async (body: StoryAction, ok: string) => {
    setBusy(true); setError(null); setDone(null);
    const r = await postStories(body);
    setBusy(false);
    if (!r.ok) { setError(r.error); return }
    setAsk(null); setReason("")
    setDone(r.changed ? ok : r.closed ? `${r.closed === 1 ? "דיווח אחד נסגר" : `${r.closed} דיווחים נסגרו`}, והפריט כבר היה כך.` : "כבר היה כך, לא השתנה כלום.");
    router.refresh();
  };
  return (
    <StoriesQueueView data={data} canManage={canManage} canPilot={canPilot} busy={busy} ask={ask} reason={reason} error={error} done={done}
      pilotId={pilotId} pilotNote={pilotNote}
      onAsk={(a) => { setAsk(a); setReason(""); setError(null); setDone(null) }} onCancel={() => setAsk(null)} onReason={setReason}
      onRefresh={() => router.refresh()} onPilotId={setPilotId} onPilotNote={setPilotNote}
      onConfirm={() => { if (ask) void send(actionBody(ask, reason), doneText(ask)) }}
      onPilotOn={() => { void send({ action: "pilot_on", building_id: pilotId, ...(pilotNote.trim() ? { note: pilotNote.trim() } : {}) }, "הסטורי נפתח בבניין.") }}
      offId={offId} offNote={offNote} onOffId={setOffId} onOffNote={setOffNote}
      onOff={() => { void send({ action: "building_off", building_id: offId, note: offNote.trim() }, "הסטורי כובה בבניין.").then(() => { setOffId(""); setOffNote("") }) }} />
  );
}
