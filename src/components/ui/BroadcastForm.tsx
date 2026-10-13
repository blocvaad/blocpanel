"use client";
// BroadcastForm — הודעה של צוות bloc לבניינים (bloc UI-R5a).
//
// קודם: ברירת המחדל הייתה "קבוע" (ההודעה נשארה אצל כל הבניינים בלי דרך להוריד), העדיפויות היו עם שמות
// הפוכים ("רגיל" נשלח כ-low, "חשוב" כ-normal), אימוג'י בכפתורים, בחירת בניין אחד בלבד, ו-"✓ נשלחה" בלי
// לבדוק כמה באמת קיבלו. עכשיו:
//   • למי: כל הבניינים הפעילים, או בניינים נבחרים (חיפוש, כמה שרוצים; מושעה — לא לבחירה).
//   • עדיפות במילים של האפליקציה; "כמה זמן תוצג" — שבוע כברירת מחדל; "בלי סיום" — רק עם אישור.
//   • הצמדה ובקשת אישור קריאה; תצוגה של מה שהדיירים יראו; אישור לפני שליחה.
//   • מזהה שידור לכל טיוטה: שליחה חוזרת / המשך לא שולחים פעמיים. התוצאה — כמה קיבלו, כמה לא, וניסיון נוסף.
import { useMemo, useRef, useState } from "react";
import { Send, Users, Building2, Search, RefreshCw } from "lucide-react";
import { ilDateTime } from "@/lib/committee";
import {
  DEFAULT_DURATION, expiryFor, expiryText, hasBlanks, priorityColor, priorityLabel, sendOutcomeText,
  type DurationKey, type Priority,
} from "@/lib/broadcasts";
import {
  Section, Modal, Toggle, PriorityPicker, DurationPicker, Banner, ApiErrorBanner, sendBroadcastApi, ghostBtn, solidBtn, fieldLabel,
} from "./broadcastKit";

export interface BroadcastBuilding { id: string; name: string; suspended: boolean }

interface SendResult { broadcast_id: string; expires_at: string | null; total: number; delivered: number; failed: number; remaining: number; skipped: number }
type Body = Record<string, unknown>;

const TITLE_MAX = 200;
const CONTENT_MAX = 3000;
/** סבבי המשך מהמסך (השרת כבר ממשיך בעצמו ~35 שניות). */
const CLIENT_ROUNDS = 6;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const plural = (n: number) => (n === 1 ? "בניין אחד" : `${n} בניינים`);

export default function BroadcastForm({ buildings, configured, onSent }: {
  buildings: BroadcastBuilding[];
  configured: boolean;
  /** אחרי שליחה — רענון הרשימה של מה שנשלח. */
  onSent: () => void;
}) {
  const [target, setTarget] = useState<"all" | "some">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [duration, setDuration] = useState<DurationKey>(DEFAULT_DURATION);
  const [date, setDate] = useState("");
  const [keepNone, setKeepNone] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [ack, setAck] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);   // 401 = ההתחברות לפאנל הסתיימה
  const [result, setResult] = useState<(SendResult & { title: string }) | null>(null);
  // מזהה השידור שייך לנוסח: אותו נוסח שוב (אחרי כשל) — אותו מזהה, ומה שכבר קיבל לא מקבל שוב; נוסח אחר
  // (שינוי בכותרת, בתוכן, ביעד, בעדיפות, בתוקף, באפשרויות) — מזהה חדש: שידור חדש, לא "המשך" של הקודם.
  const draft = useRef<{ id: string; fp: string | null }>({ id: newId(), fp: null });
  const lastBody = useRef<Body | null>(null);
  const lastFp = useRef<string | null>(null);

  const active = useMemo(() => buildings.filter((b) => !b.suspended), [buildings]);
  const chosen = useMemo(() => active.filter((b) => selected.has(b.id)), [active, selected]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? buildings.filter((b) => b.name.toLowerCase().includes(q)) : buildings;
  }, [buildings, search]);
  const count = target === "all" ? active.length : chosen.length;
  const end = expiryFor(duration, date);

  const problem =
    !configured ? "השליחה לא זמינה: החיבור ל-bloc לא מוגדר." :
    !title.trim() ? "כתבו כותרת." :
    !content.trim() ? "כתבו את ההודעה." :
    hasBlanks(title, content) ? "נשארו בהודעה מקומות ריקים (___)." :
    count === 0 ? (target === "all" ? "אין בניינים פעילים." : "בחרו לפחות בניין אחד.") :
    end === undefined ? "בחרו תאריך סיום מהיום ועד שנה קדימה." :
    duration === "none" && !keepNone ? "אשרו שההודעה תישאר בלי תאריך סיום." : null;

  const toggle = (id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const fingerprint = (b: Body) => JSON.stringify(b);
  const formBody = (): Body => ({
    title: title.trim(), content: content.trim(), priority,
    ...(target === "some" ? { building_ids: chosen.map((b) => b.id) } : {}),
    duration, ...(duration === "date" ? { date } : {}),
    requires_ack: ack, is_pinned: pinned,
  });

  // הנוסח שבטופס עכשיו (גם אחרי שהבקשה חזרה — הפונקציה למטה רצה מתוך רינדור קודם).
  const currentFp = useRef("");
  currentFp.current = fingerprint(formBody());

  async function post(body: Body, sentFp: string | null) {
    setBusy(true); setError(null); setLogin(false);
    let r = await sendBroadcastApi<SendResult>("POST", body);
    // השרת כבר המשיך בעצמו; אם עדיין נשאר — ממשיכים מכאן, עם אותו מזהה ואותו תאריך סיום.
    for (let round = 0; r.ok && r.data.remaining > 0 && round < CLIENT_ROUNDS; round++) {
      const { duration: _d, date: _t, ...rest } = body;
      r = await sendBroadcastApi<SendResult>("POST", { ...rest, expires_at: r.data.expires_at });
    }
    setBusy(false);
    setConfirming(false);
    if (!r.ok) { setError(r.error); setLogin(r.status === 401); return; }
    const { duration: _d, date: _t, ...rest } = body;
    lastBody.current = { ...rest, expires_at: r.data.expires_at };
    lastFp.current = sentFp;
    setResult({ ...r.data, title: String(body.title) });
    // הכל הגיע — הטופס מתנקה לשליחה הבאה (היעד והעדיפות נשארים). רק אם בטופס עדיין הנוסח שנשלח: "ניסיון
    // נוסף" מהשורה למעלה לא מוחק הודעה חדשה שהתחלתם לכתוב בינתיים.
    if (!r.data.failed && !r.data.remaining && sentFp !== null && sentFp === currentFp.current) {
      setTitle(""); setContent(""); setPinned(false); setAck(false); setKeepNone(false);
      draft.current = { id: newId(), fp: null };
    }
    onSent();
  }

  function submit() {
    if (problem || busy) return;
    const b = formBody();
    const fp = fingerprint(b);
    if (draft.current.fp !== null && draft.current.fp !== fp) draft.current = { id: newId(), fp };
    else draft.current.fp = fp;
    void post({ broadcast_id: draft.current.id, ...b }, fp);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-broadcast-form="">
      {result && <SendOutcome r={result} busy={busy} onRetry={() => lastBody.current && void post(lastBody.current, lastFp.current)} onDismiss={() => setResult(null)} />}

      <Section title="למי" id="bf-target">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "8px" }} role="radiogroup" aria-labelledby="bf-target">
          <TargetOption on={target === "all"} onClick={() => setTarget("all")} icon={<Users size={18} />} label="כל הבניינים הפעילים" sub={plural(active.length)} name="all" />
          <TargetOption on={target === "some"} onClick={() => setTarget("some")} icon={<Building2 size={18} />} label="בניינים נבחרים" sub={chosen.length === 1 ? "נבחר בניין אחד" : chosen.length ? `נבחרו ${chosen.length} בניינים` : "בחירה מהרשימה"} name="some" />
        </div>
        {target === "some" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-2)" }} />
              <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש בניין" aria-label="חיפוש בניין" style={{ paddingRight: "40px" }} />
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" style={ghostBtn} onClick={() => setSelected((cur) => new Set([...cur, ...shown.filter((b) => !b.suspended).map((b) => b.id)]))}>
                {search.trim() ? "בחירת כל התוצאות" : "בחירת הכל"}
              </button>
              {selected.size > 0 && <button type="button" style={ghostBtn} onClick={() => setSelected(new Set())}>ניקוי הבחירה</button>}
            </div>
            <ul style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "10px", listStyle: "none" }} aria-label="בניינים">
              {shown.map((b) => (
                <li key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "46px", padding: "0 12px", cursor: b.suspended ? "not-allowed" : "pointer", opacity: b.suspended ? 0.55 : 1 }}>
                    <input type="checkbox" checked={selected.has(b.id) && !b.suspended} disabled={b.suspended} onChange={() => toggle(b.id)} data-building-option={b.id} style={{ width: "18px", height: "18px" }} />
                    <span style={{ flex: 1, fontSize: "14.5px", color: "var(--text)" }}>{b.name}</span>
                    {b.suspended && <span className="badge" style={{ color: "var(--text-2)", background: "#52525b40" }}>מושעה</span>}
                  </label>
                </li>
              ))}
              {!shown.length && <li style={{ padding: "16px", fontSize: "14px", color: "var(--text-2)", textAlign: "center" }}>אין בניין בשם הזה</li>}
            </ul>
          </div>
        )}
      </Section>

      <Section title="עדיפות" hint="הודעה דחופה מגיעה עם התראה גם בשעות הלילה. בשאר העדיפויות ההתראה לפי ההגדרות של כל דייר." id="bf-priority">
        <PriorityPicker value={priority} onChange={setPriority} />
      </Section>

      <Section title="כמה זמן תוצג" hint="אחרי התאריך ההודעה יורדת מהמסך של הדיירים. אפשר להוריד, להאריך או לקצר גם אחרי השליחה." id="bf-duration">
        <DurationPicker value={duration} date={date} keepNone={keepNone} onChange={(d) => { setDuration(d); setKeepNone(false); }} onDate={setDate} onKeepNone={setKeepNone} />
      </Section>

      <Section title="ההודעה" id="bf-text">
        <label style={fieldLabel}>
          כותרת
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="למשל: עדכון גרסה באפליקציה" data-broadcast-title="" />
        </label>
        <label style={fieldLabel}>
          תוכן
          <textarea className="input" value={content} onChange={(e) => setContent(e.target.value)} maxLength={CONTENT_MAX} rows={6} placeholder="מה הדיירים צריכים לדעת"
            data-broadcast-content="" style={{ height: "auto", padding: "12px 14px", lineHeight: 1.6, resize: "vertical" }} />
          <span style={{ alignSelf: "flex-end", fontSize: "12.5px", color: "var(--text-2)" }} dir="ltr">{content.length}/{CONTENT_MAX}</span>
        </label>
      </Section>

      <Section title="אפשרויות" id="bf-options">
        <Toggle name="pinned" checked={pinned} onChange={setPinned} label="הצמדה לראש הרשימה" hint="ההודעה תופיע ראשונה במסך ההודעות של הבניין." />
        <Toggle name="ack" checked={ack} onChange={setAck} label="בקשת אישור קריאה" hint={'הדיירים יתבקשו ללחוץ "קראתי ואישרתי", והוועד יראה מי אישר.'} />
      </Section>

      <Section title="כך הדיירים יראו אותה" id="bf-preview">
        <Preview title={title} content={content} priority={priority} pinned={pinned} ack={ack} end={end} />
      </Section>

      {error && <ApiErrorBanner error={error} login={login} />}
      {problem && (title || content) && !error && <p style={{ fontSize: "13.5px", color: "var(--text-2)" }} data-broadcast-problem="">{problem}</p>}

      <button type="button" disabled={!!problem || busy} onClick={() => setConfirming(true)} data-broadcast-submit=""
        style={{ ...solidBtn(problem ? "var(--border)" : "var(--text)", problem ? "var(--text-2)" : "var(--bg)"), width: "100%", minHeight: "52px", cursor: problem ? "not-allowed" : "pointer" }}>
        <Send size={18} />
        {target === "all" ? `שליחה לכל הבניינים הפעילים (${active.length})` : chosen.length === 1 ? "שליחה לבניין אחד" : `שליחה ל-${chosen.length} בניינים`}
      </button>

      {confirming && (
        <Modal title="לשלוח את ההודעה?" onClose={() => setConfirming(false)} busy={busy}>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: "14.5px" }} data-broadcast-summary="">
            <dt style={{ color: "var(--text-2)" }}>למי</dt>
            <dd style={{ color: "var(--text)" }}>{target === "all" ? `כל הבניינים הפעילים (${active.length})` : namesText(chosen.map((b) => b.name))}</dd>
            <dt style={{ color: "var(--text-2)" }}>עדיפות</dt>
            <dd style={{ color: "var(--text)" }}>{priorityLabel(priority)}{priority === "urgent" ? ", התראה גם בלילה" : ""}</dd>
            <dt style={{ color: "var(--text-2)" }}>תוצג</dt>
            <dd style={{ color: "var(--text)" }}>{end ? `עד ${ilDateTime(end)}` : "בלי תאריך סיום"}</dd>
            {(pinned || ack) && <>
              <dt style={{ color: "var(--text-2)" }}>אפשרויות</dt>
              <dd style={{ color: "var(--text)" }}>{[pinned ? "מוצמדת לראש הרשימה" : "", ack ? "בקשת אישור קריאה" : ""].filter(Boolean).join(", ")}</dd>
            </>}
          </dl>
          <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>הדיירים יקבלו התראה לפי ההגדרות שלהם. ההודעה תופיע בשם &quot;צוות bloc&quot;.</p>
          {error && <ApiErrorBanner error={error} login={login} />}
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" style={{ ...ghostBtn, flex: 1, minHeight: "48px" }} onClick={() => setConfirming(false)} disabled={busy}>ביטול</button>
            <button type="button" style={{ ...solidBtn("var(--text)", "var(--bg)"), flex: 1 }} onClick={submit} disabled={busy} data-broadcast-confirm="">
              <Send size={17} />{busy ? "שולחים…" : "שליחה"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function namesText(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} ועוד ${names.length - 3}`;
}

function TargetOption({ on, onClick, icon, label, sub, name }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string; name: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} data-target={name}
      style={{ minHeight: "64px", padding: "12px 14px", borderRadius: "10px", border: `2px solid ${on ? "var(--blue)" : "var(--border)"}`, background: on ? "#3b82f612" : "transparent", display: "flex", alignItems: "center", gap: "12px", textAlign: "right", color: "var(--text)" }}>
      <span style={{ width: "40px", height: "40px", borderRadius: "10px", background: on ? "#3b82f625" : "var(--surface)", color: on ? "var(--blue)" : "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "15px", fontWeight: 700 }}>{label}</span>
        <span style={{ display: "block", fontSize: "13px", color: "var(--text-2)", marginTop: "2px" }}>{sub}</span>
      </span>
    </button>
  );
}

/** כרטיס ההודעה כמו במסך ההודעות של הדיירים (בהיר — כמו באפליקציה). */
function Preview({ title, content, priority, pinned, ack, end }: { title: string; content: string; priority: Priority; pinned: boolean; ack: boolean; end: string | null | undefined }) {
  const urgent = priority === "urgent";
  return (
    <div data-broadcast-preview="" style={{ background: "#ffffff", color: "#0f172a", borderRadius: "16px", padding: "16px", border: `1px solid ${urgent ? "#fecaca" : "#e2e8f0"}`, display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "13px", fontWeight: 700 }}>
        <span style={{ color: priority === "low" || priority === "normal" ? "#475569" : priorityColor(priority) }}>{priorityLabel(priority)}</span>
        {pinned && <span style={{ color: "#1d4ed8" }}>מוצמדת</span>}
      </div>
      <div style={{ fontSize: "16.5px", fontWeight: 800, lineHeight: 1.4 }}>{title.trim() || "כותרת ההודעה"}</div>
      <div style={{ fontSize: "14.5px", lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#334155" }}>{content.trim() || "התוכן יופיע כאן."}</div>
      {ack && <div style={{ alignSelf: "flex-start", marginTop: "4px", padding: "8px 14px", borderRadius: "10px", background: "#1d4ed8", color: "#fff", fontSize: "14px", fontWeight: 700 }}>קראתי ואישרתי</div>}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "13px", color: "#64748b" }}>
        <span aria-hidden style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1d4ed8", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "14px" }}>b</span>
        <span style={{ fontWeight: 700, color: "#0f172a" }}>צוות bloc</span>
        <span>{end === undefined ? "" : expiryText(end)}</span>
      </div>
    </div>
  );
}

function SendOutcome({ r, busy, onRetry, onDismiss }: { r: SendResult & { title: string }; busy: boolean; onRetry: () => void; onDismiss: () => void }) {
  const partial = r.failed > 0 || r.remaining > 0;
  return (
    <Banner tone={!r.delivered && partial ? "error" : partial ? "warn" : "ok"} action={
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {partial && <button type="button" style={ghostBtn} onClick={onRetry} disabled={busy} data-broadcast-retry=""><RefreshCw size={15} />{busy ? "שולחים…" : r.remaining > 0 ? "המשך השליחה" : "ניסיון נוסף לבניינים שלא קיבלו"}</button>}
        <button type="button" style={ghostBtn} onClick={onDismiss}>סגירה</button>
      </div>
    }>
      <span data-broadcast-result="">{sendOutcomeText(r)}</span>
    </Banner>
  );
}
