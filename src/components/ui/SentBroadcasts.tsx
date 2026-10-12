"use client";
// SentBroadcasts — ההודעות שצוות bloc שלח לבניינים, וניהול שלהן (bloc UI-R5a).
//
// קודם: אחרי שליחה לא הייתה שום דרך להוריד הודעה — היא נשארה אצל כל הבניינים (גם "קבוע"). עכשיו, לכל
// הודעה: למי ועד מתי, מי שלח, כמה ראו / אישרו (גם לפי בניין), ו:
//   • הורדה עכשיו — יורדת מיד מכל הבניינים; נשארת כאן ב"הסתיימו", ואפשר להציג אותה מחדש.
//   • עריכה — כותרת, תוכן, עדיפות, הצמדה, אישור קריאה (בלי התראה חדשה).
//   • תוקף — להאריך / לקצר / "בלי סיום" (עם אישור); להודעה שהסתיימה — הצגה מחדש.
//   • מחיקה — סופר-אדמין, עם ההתראות שהובילו אליה.
// גם הודעות שנשלחו לפני העדכון (בלי מזהה שידור) מופיעות ומנוהלות — מקובצות לפי כותרת וזמן שליחה.
import { useState } from "react";
import { EyeOff, Pencil, Calendar, Trash2, ChevronDown, RefreshCw } from "lucide-react";
import { ilDateTime } from "@/lib/committee";
import {
  DEFAULT_DURATION, buildingsText, inBuildingsText, expiryFor, expiryShort, expiryText, priorityColor, priorityLabel, readersText,
  type DurationKey, type Priority,
} from "@/lib/broadcasts";
import { Modal, Toggle, PriorityPicker, DurationPicker, Banner, sendBroadcastApi, ghostBtn, solidBtn, fieldLabel } from "./broadcastKit";

export interface SentBuilding { id: string; name: string; suspended: boolean; active: boolean; seen: number | null; acked: number | null; members: number | null }
export interface Sent {
  key: string; broadcastId: string | null; legacy: boolean; ids?: string[];
  title: string; content: string; priority: Priority; isPinned: boolean; requiresAck: boolean;
  expiresAt: string | null; createdAt: string; state: "active" | "ended" | "partial"; sender: string | null;
  totals: { buildings: number; seen: number | null; acked: number | null; members: number | null };
  buildings: SentBuilding[];
}
export interface SentLoaded { configured: boolean; canManage: boolean; canDelete: boolean; ack: boolean; stats: boolean; truncated: boolean; broadcasts: Sent[] }

type Mode = "end" | "edit" | "expiry" | "delete";
const targetOf = (x: Sent) => (x.broadcastId ? { broadcast_id: x.broadcastId } : { ids: x.ids ?? [] });

export default function SentBroadcasts({ data, view, onChanged, onNotice }: {
  data: SentLoaded;
  view: "active" | "ended";
  onChanged: () => void;
  onNotice: (text: string) => void;
}) {
  const [open, setOpen] = useState<{ x: Sent; mode: Mode } | null>(null);
  const list = data.broadcasts.filter((x) => (view === "ended" ? x.state === "ended" : x.state !== "ended"));
  const manage = data.canManage && data.configured;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-sent-list={view}>
      {data.canManage && !data.configured && (
        <Banner tone="warn">אפשר לראות את ההודעות, אבל לא לנהל אותן: ב-Vercel של הפאנל חסרים BLOC_APP_URL ו/או PANEL_ACTION_SECRET.</Banner>
      )}
      {list.length === 0 ? (
        <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--text-2)", fontSize: "14.5px" }} data-sent-empty={view}>
          {view === "ended" ? "אין הודעות שהסתיימו בשנה האחרונה." : "אין עכשיו הודעות של צוות bloc אצל הדיירים."}
        </div>
      ) : list.map((x) => (
        <SentCard key={x.key} x={x} manage={manage} canDelete={data.canDelete && data.configured} ack={data.ack} onAct={(mode) => setOpen({ x, mode })} />
      ))}
      {data.truncated && <p style={{ fontSize: "13px", color: "var(--text-2)" }}>מוצגות 100 ההודעות האחרונות מהשנה האחרונה.</p>}

      {open?.mode === "end" && <EndModal x={open.x} onClose={() => setOpen(null)} onDone={(t) => { setOpen(null); onNotice(t); onChanged(); }} />}
      {open?.mode === "edit" && <EditModal x={open.x} ack={data.ack} onClose={() => setOpen(null)} onDone={(t) => { setOpen(null); onNotice(t); onChanged(); }} />}
      {open?.mode === "expiry" && <ExpiryModal x={open.x} onClose={() => setOpen(null)} onDone={(t) => { setOpen(null); onNotice(t); onChanged(); }} />}
      {open?.mode === "delete" && <DeleteModal x={open.x} onClose={() => setOpen(null)} onDone={(t) => { setOpen(null); onNotice(t); onChanged(); }} />}
    </div>
  );
}

const STATE: Record<Sent["state"], { label: string; cls: string }> = {
  active: { label: "מוצגת", cls: "badge-green" },
  partial: { label: "מוצגת בחלק מהבניינים", cls: "badge-yellow" },
  ended: { label: "הסתיימה", cls: "badge-muted" },
};
/** badge-muted של הפאנל (#52525b על #18181b) כמעט לא נקרא — כאן בניגודיות קריאה. */
const muted: React.CSSProperties = { color: "var(--text-2)", background: "#52525b40" };

function SentCard({ x, manage, canDelete, ack, onAct }: { x: Sent; manage: boolean; canDelete: boolean; ack: boolean; onAct: (m: Mode) => void }) {
  const [more, setMore] = useState(false);
  const long = x.content.length > 220 || x.content.split("\n").length > 4;
  const ended = x.state === "ended";
  const { seen, acked, members } = x.totals;
  return (
    <article className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", opacity: ended ? 0.85 : 1 }} data-sent={x.key}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        <span className={`badge ${STATE[x.state].cls}`} style={x.state === "ended" ? muted : undefined} data-sent-state={x.state}>{STATE[x.state].label}</span>
        <span className="badge" style={{ background: `${priorityColor(x.priority)}1f`, color: priorityColor(x.priority) }}>{priorityLabel(x.priority)}</span>
        {x.isPinned && <span className="badge badge-blue">מוצמדת</span>}
        {x.requiresAck && <span className="badge badge-blue">בקשת אישור קריאה</span>}
      </div>

      <h3 style={{ fontSize: "16.5px", fontWeight: 800, color: "var(--text)", lineHeight: 1.4 }}>{x.title}</h3>
      {x.content && (
        <div>
          <p style={{ fontSize: "14.5px", color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap", ...(long && !more ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>{x.content}</p>
          {long && <button type="button" onClick={() => setMore(!more)} style={{ background: "none", border: "none", padding: "8px 0", minHeight: "44px", color: "var(--blue)", fontSize: "14px", fontWeight: 600 }}>{more ? "פחות" : "המשך קריאה"}</button>}
        </div>
      )}

      <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px" }}>
        <Fact label="נשלחה" value={ilDateTime(x.createdAt)} />
        <Fact label="על ידי" value={x.sender ?? "לא ידוע"} />
        <Fact label="יעד" value={buildingsText(x.totals.buildings)} />
        <Fact label="תוקף" value={expiryShort(x.expiresAt)} />
      </dl>

      {seen !== null && (
        <p style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }} data-sent-stats="">
          {readersText(seen, members, false)}
          {x.requiresAck && ack && acked !== null && <><br />{readersText(acked, members, true)}</>}
        </p>
      )}

      {x.buildings.length > 0 && (
        <details>
          <summary style={{ minHeight: "44px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "var(--text-2)", listStyle: "none" }}>
            <ChevronDown size={16} />לפי בניין ({x.buildings.length})
          </summary>
          <ul style={{ listStyle: "none", border: "1px solid var(--border)", borderRadius: "10px" }} data-sent-buildings="">
            {x.buildings.map((b) => (
              <li key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: "14px" }}>
                <span style={{ flex: 1, minWidth: 0, color: "var(--text)" }}>{b.name}</span>
                {b.suspended && <span className="badge" style={muted}>מושעה</span>}
                {!b.active && <span className="badge" style={muted}>ירדה</span>}
                {b.seen !== null && (
                  <span style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    ראו {b.seen}{b.members !== null ? `/${b.members}` : ""}{x.requiresAck && b.acked !== null ? `, אישרו ${b.acked}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {manage && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {!ended && <button type="button" style={{ ...ghostBtn, borderColor: "#ef444455", color: "#fca5a5" }} onClick={() => onAct("end")} data-sent-action="end"><EyeOff size={16} />הורדה עכשיו</button>}
          <button type="button" style={ghostBtn} onClick={() => onAct("expiry")} data-sent-action="expiry"><Calendar size={16} />{ended ? "הצגה מחדש" : "שינוי תוקף"}</button>
          <button type="button" style={ghostBtn} onClick={() => onAct("edit")} data-sent-action="edit"><Pencil size={16} />עריכה</button>
          {canDelete && <button type="button" style={{ ...ghostBtn, color: "var(--text-2)" }} onClick={() => onAct("delete")} data-sent-action="delete"><Trash2 size={16} />מחיקה</button>}
        </div>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px" }}>
      <dt style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{label}</dt>
      <dd style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginTop: "2px", overflowWrap: "anywhere" }}>{value}</dd>
    </div>
  );
}

// ── חלונות הפעולה ───────────────────────────────────────────────────────────

function useAction(onDone: (text: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (method: "PATCH" | "DELETE", body: unknown, done: string) => {
    setBusy(true); setError(null);
    const r = await sendBroadcastApi(method, body);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onDone(done);
  };
  return { busy, error, run };
}

function Buttons({ busy, onCancel, onOk, okLabel, okColor, okFg = "white", disabled, name }: { busy: boolean; onCancel: () => void; onOk: () => void; okLabel: string; okColor: string; okFg?: string; disabled?: boolean; name: string }) {
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <button type="button" style={{ ...ghostBtn, flex: 1, minHeight: "48px" }} onClick={onCancel} disabled={busy}>ביטול</button>
      <button type="button" style={{ ...solidBtn(okColor, okFg), flex: 1, opacity: disabled ? 0.5 : 1 }} onClick={onOk} disabled={busy || disabled} data-modal-ok={name}>
        {busy ? "רגע…" : okLabel}
      </button>
    </div>
  );
}

function EndModal({ x, onClose, onDone }: { x: Sent; onClose: () => void; onDone: (t: string) => void }) {
  const a = useAction(onDone);
  const where = inBuildingsText(x.totals.buildings);
  return (
    <Modal title="להוריד את ההודעה עכשיו?" onClose={onClose} busy={a.busy}>
      <p style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.65 }}>
        &quot;{x.title}&quot; תרד מיד מהמסך של הדיירים {where}. היא תישאר כאן, ב&quot;הסתיימו&quot;, ואפשר להציג אותה מחדש.
      </p>
      {a.error && <Banner tone="error">{a.error}</Banner>}
      <Buttons name="end" busy={a.busy} onCancel={onClose} okLabel="הורדה עכשיו" okColor="#ef4444"
        onOk={() => void a.run("PATCH", { action: "end", ...targetOf(x) }, `"${x.title}" ירדה מכל הבניינים.`)} />
    </Modal>
  );
}

function EditModal({ x, ack: ackKnown, onClose, onDone }: { x: Sent; ack: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const a = useAction(onDone);
  const [title, setTitle] = useState(x.title);
  const [content, setContent] = useState(x.content);
  const [priority, setPriority] = useState<Priority>(x.priority);
  const [pinned, setPinned] = useState(x.isPinned);
  const [ack, setAck] = useState(x.requiresAck);
  const changes: Record<string, unknown> = {};
  if (title.trim() !== x.title) changes.title = title.trim();
  if (content.trim() !== x.content.trim()) changes.content = content.trim();
  if (priority !== x.priority) changes.priority = priority;
  if (pinned !== x.isPinned) changes.is_pinned = pinned;
  if (ackKnown && ack !== x.requiresAck) changes.requires_ack = ack;
  const empty = !title.trim() || !content.trim();
  return (
    <Modal title="עריכת ההודעה" onClose={onClose} busy={a.busy} width={600}>
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>השינוי מופיע מיד אצל הדיירים {inBuildingsText(x.totals.buildings)}. לא נשלחת התראה חדשה.</p>
      <label style={fieldLabel}>
        כותרת
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} data-edit-title="" />
      </label>
      <label style={fieldLabel}>
        תוכן
        <textarea className="input" value={content} onChange={(e) => setContent(e.target.value)} maxLength={3000} rows={6} data-edit-content=""
          style={{ height: "auto", padding: "12px 14px", lineHeight: 1.6, resize: "vertical" }} />
      </label>
      <PriorityPicker value={priority} onChange={setPriority} />
      <Toggle name="edit-pinned" checked={pinned} onChange={setPinned} label="הצמדה לראש הרשימה" />
      {ackKnown && <Toggle name="edit-ack" checked={ack} onChange={setAck} label="בקשת אישור קריאה" />}
      {a.error && <Banner tone="error">{a.error}</Banner>}
      <Buttons name="edit" busy={a.busy} onCancel={onClose} okLabel="שמירה" okColor="var(--text)" okFg="var(--bg)" disabled={empty || !Object.keys(changes).length}
        onOk={() => void a.run("PATCH", { action: "update", ...targetOf(x), ...changes }, "השינויים נשמרו.")} />
    </Modal>
  );
}

function ExpiryModal({ x, onClose, onDone }: { x: Sent; onClose: () => void; onDone: (t: string) => void }) {
  const a = useAction(onDone);
  const [duration, setDuration] = useState<DurationKey>(DEFAULT_DURATION);
  const [date, setDate] = useState("");
  const [keepNone, setKeepNone] = useState(false);
  const end = expiryFor(duration, date);
  const ready = end !== undefined && (duration !== "none" || keepNone);
  const ended = x.state === "ended";
  return (
    <Modal title={ended ? "להציג את ההודעה מחדש" : "שינוי תוקף"} onClose={onClose} busy={a.busy}>
      <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }}>
        עכשיו: {expiryText(x.expiresAt)}. התוקף החדש נספר מעכשיו{ended ? ", וההודעה תחזור למסך של הדיירים (בלי התראה חדשה)" : ""}.
      </p>
      <DurationPicker value={duration} date={date} keepNone={keepNone} onChange={(d) => { setDuration(d); setKeepNone(false); }} onDate={setDate} onKeepNone={setKeepNone} />
      {a.error && <Banner tone="error">{a.error}</Banner>}
      <Buttons name="expiry" busy={a.busy} onCancel={onClose} okLabel={ended ? "הצגה מחדש" : "שמירה"} okColor="var(--text)" okFg="var(--bg)" disabled={!ready}
        onOk={() => void a.run("PATCH", { action: "update", ...targetOf(x), duration, ...(duration === "date" ? { date } : {}) },
          end ? `"${x.title}" מוצגת עד ${ilDateTime(end)}.` : `"${x.title}" מוצגת בלי תאריך סיום.`)} />
    </Modal>
  );
}

function DeleteModal({ x, onClose, onDone }: { x: Sent; onClose: () => void; onDone: (t: string) => void }) {
  const a = useAction(onDone);
  const [sure, setSure] = useState(false);
  return (
    <Modal title="למחוק את ההודעה?" onClose={onClose} busy={a.busy}>
      <p style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.65 }}>
        &quot;{x.title}&quot; תימחק מכל הבניינים, יחד עם ההתראות שהובילו אליה ועם נתוני הקריאה. אי אפשר לשחזר.
        {x.state !== "ended" && " אם רק צריך שלא תוצג, עדיף להוריד אותה."}
      </p>
      <label style={{ display: "flex", gap: "10px", alignItems: "center", minHeight: "44px", fontSize: "14px", color: "var(--text)", cursor: "pointer" }}>
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} data-delete-sure="" style={{ width: "20px", height: "20px" }} />
        מחיקה סופית
      </label>
      {a.error && <Banner tone="error">{a.error}</Banner>}
      <Buttons name="delete" busy={a.busy} onCancel={onClose} okLabel="מחיקה" okColor="#ef4444" disabled={!sure}
        onOk={() => void a.run("DELETE", { ...targetOf(x), confirm: true }, `"${x.title}" נמחקה.`)} />
    </Modal>
  );
}

export function SentLoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Banner tone="error" action={<button type="button" style={ghostBtn} onClick={onRetry}><RefreshCw size={15} />ניסיון נוסף</button>}>
      {error}
    </Banner>
  );
}
