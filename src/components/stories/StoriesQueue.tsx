"use client";
// stories/StoriesQueue — המיתון של הסטורי (bloc STORIES-1, החלטות 439, 441): הסטורי של bloc כבוי לכל הבניינים, ופתוח רק
// בבניינים שבפיילוט. כאן — הדיווחים של דיירים על פריט בסטורי (לפי פריט: כמה דיווחו ולמה, הראשון והאחרון — אף פעם לא מי),
// מה שצוות bloc הסתיר, והבניינים בפיילוט. כל פעולה — אישור שאומר מה יקרה, ונשלחת ל-bloc החתום (/api/stories → internal/stories).
// הסתרה — עם סיבה (3–300 תווים): הפריט יוצא מהסטורי של הבניין, והדיווחים הפתוחים עליו נסגרים; השורה המקורית (ההודעה, המודעה…)
// לא משתנה. "בדקנו — להשאיר": הדיווחים נסגרים, הפריט נשאר. החזרה — הפריט חוזר. הפיילוט — סופר-אדמין בלבד.
// נכשל / ריק / חסר SQL — מצבים שונים. StoriesQueue — המצב והבקשה; StoriesQueueView — התצוגה (טהורה, לבדיקות ולצילומים).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Eye, ShieldCheck, Flag, RefreshCw } from "lucide-react";
import { Banner, Section, Tag, ghostBtn, solidBtn, fieldLabel, inputStyle } from "@/components/ui/panelKit";
import { STORY_SOURCE_LABEL, type StoryAction, type StoryHiddenRow, type StoryItem, type StoryPilotRow, type StoryReportGroup } from "@/lib/storiesPanel";
import type { StoriesQueueData } from "@/lib/storiesServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const STORIES_PRIVACY_TEXT = "מי דיווח — לא מוצג כאן ולא נשלח לפאנל. הוועד רואה רק שפריט הוסתר, בלי מי ולמה.";
export const STORIES_EMPTY_TEXT = "אין דיווחים פתוחים.";
export const STORIES_FAILED_TEXT = "טעינת התור נכשלה — זה לא אומר שאין דיווחים. נסו שוב.";
export const STORIES_SQL_MISSING_TEXT = "הסטורי עוד לא הותקן ב-bloc (SQL 235). אחרי ההתקנה — רעננו.";

type Ask =
  | { kind: "hide"; g: StoryReportGroup }
  | { kind: "dismiss"; g: StoryReportGroup }
  | { kind: "unhide"; h: StoryHiddenRow }
  | { kind: "pilot_off"; p: StoryPilotRow };

/** מה יקרה — המשפט של האישור. */
export function askText(a: Ask): string {
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
}

export function StoriesQueueView(p: StoriesQueueViewProps) {
  const { data } = p;
  const head = (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 800 }}>סטורי — מיתון</h1>
      <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>הסטורי של bloc כבוי לכל הבניינים ופתוח רק בבניינים שבפיילוט. {STORIES_PRIVACY_TEXT}</p>
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
        <button type="button" style={solidBtn(p.ask.kind === "hide" || p.ask.kind === "pilot_off" ? "#dc2626" : "#1d4ed8")} disabled={p.busy || (p.ask.kind === "hide" && p.reason.trim().length < 3)}
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
                <button type="button" style={ghostBtn} onClick={() => p.onAsk({ kind: "dismiss", g })} data-story-dismiss=""><ShieldCheck size={16} aria-hidden="true" /> בדקנו — להשאיר</button>
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
      <Section title="בניינים בפיילוט" hint="רק בהם הדיירים רואים את הסטורי. לא פותחים לכולם לפני בדיקות אבטחה, פרטיות ומיתון תוכן.">
        {data.pilot.length === 0 ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-story-no-pilot="">אין בניינים בפיילוט — הסטורי כבוי בכל מקום.</div> : data.pilot.map((b) => (
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
      </Section>
    </>
  );
}

const keyOf = (a: Ask) => a.kind === "hide" || a.kind === "dismiss" ? `r:${a.g.key}` : a.kind === "unhide" ? `h:${a.h.building_id}:${a.h.source}:${a.h.source_id}` : `p:${a.p.building_id}`;

/** הגוף שנשלח לפאנל → bloc. */
export function actionBody(a: Ask, reason: string): StoryAction {
  if (a.kind === "hide") return { action: "hide", building_id: a.g.building_id, source: a.g.source, source_id: a.g.source_id, reason: reason.trim() };
  if (a.kind === "dismiss") return { action: "dismiss", building_id: a.g.building_id, source: a.g.source, source_id: a.g.source_id };
  if (a.kind === "unhide") return { action: "unhide", building_id: a.h.building_id, source: a.h.source, source_id: a.h.source_id };
  return { action: "pilot_off", building_id: a.p.building_id };
}

async function postStories(body: StoryAction): Promise<{ ok: true; changed: boolean; closed: number | null } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/stories", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (r.ok && j?.ok === true && typeof j.changed === "boolean") return { ok: true, changed: j.changed, closed: typeof j.closed === "number" ? j.closed : null };
    return { ok: false, error: typeof j?.error === "string" ? j.error : "לא ברור אם הפעולה בוצעה — רעננו את הרשימה." };
  } catch {
    return { ok: false, error: "אין חיבור — לא ברור אם הפעולה בוצעה. רעננו את הרשימה." };
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

  const send = async (body: StoryAction, ok: string) => {
    setBusy(true); setError(null); setDone(null);
    const r = await postStories(body);
    setBusy(false);
    if (!r.ok) { setError(r.error); return }
    setAsk(null); setReason("")
    setDone(r.changed ? ok : r.closed ? `${r.closed === 1 ? "דיווח אחד נסגר" : `${r.closed} דיווחים נסגרו`} — הפריט כבר היה כך.` : "כבר היה כך — לא השתנה כלום.");
    router.refresh();
  };
  return (
    <StoriesQueueView data={data} canManage={canManage} canPilot={canPilot} busy={busy} ask={ask} reason={reason} error={error} done={done}
      pilotId={pilotId} pilotNote={pilotNote}
      onAsk={(a) => { setAsk(a); setReason(""); setError(null); setDone(null) }} onCancel={() => setAsk(null)} onReason={setReason}
      onRefresh={() => router.refresh()} onPilotId={setPilotId} onPilotNote={setPilotNote}
      onConfirm={() => { if (ask) void send(actionBody(ask, reason), ask.kind === "hide" ? "הפריט הוסתר." : ask.kind === "dismiss" ? "הדיווחים נסגרו." : ask.kind === "unhide" ? "הפריט חזר לסטורי." : "הסטורי נסגר בבניין.") }}
      onPilotOn={() => { void send({ action: "pilot_on", building_id: pilotId, ...(pilotNote.trim() ? { note: pilotNote.trim() } : {}) }, "הסטורי נפתח בבניין.") }} />
  );
}
