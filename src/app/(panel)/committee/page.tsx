"use client";
// המשכיות ועד — בקשות "ראש הוועד לא יכול להמשיך", בניינים בהעברה, בניינים בסיכון.
// הפעולות נשלחות ל-bloc (חתום) דרך /api/committee — הפאנל לא כותב ישירות ל-DB.
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, Clock, X, Mail, Phone, Users, Info, CheckCircle2, ShieldX, Calendar } from "lucide-react";
import {
  countdown, ilDate, ilDateTime, extendOptions, RISK_LABEL, CANCEL_KIND_LABEL, EXEC_MODE_LABEL, REASON_LABEL,
  type RiskLevel, type SuccessionReason,
} from "@/lib/committee";

type Person = { id: string; name: string; email: string | null; phone: string | null; apartment: string | null };
type BRef = { id: string; name: string; address: string | null };
type Pending = { id: string; building: BRef; requester: Person | null; head: Person | null; reasonLabel: string; note: string | null; executeAfter: string; createdAt: string; viaPanel: boolean; panelNote: string | null; panelActor: string | null };
type Handover = { id: string; building: BRef; newHead: Person | null; executedAt: string; executedMode: string | null; deadline: string | null; expired: boolean; needsPayment: boolean; collectionHeld: boolean; remindersSent: string[]; panelNote: string | null };
type History = { id: string; building: BRef; status: "executed" | "cancelled"; requester: Person | null; head: Person | null; reasonLabel: string; at: string; cancelKind: string | null; executedMode: string | null; panelActor: string | null; panelNote: string | null };
type Risk = { id: string; name: string; level: RiskLevel; admins: number; members: number; head: Person | null };
type Overview = {
  available: boolean; canManage?: boolean; canExecute?: boolean; configured?: boolean;
  pending?: Pending[]; handovers?: Handover[]; history?: History[];
  risk?: { counts: { orphan: number; single_no_deputy: number; buildings: number }; partial: boolean; rows: Risk[] };
};
type Tab = "pending" | "handover" | "risk" | "history";

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/committee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.issues?.[0]?.message ?? j.error ?? "הפעולה נכשלה" };
    return { ok: true };
  } catch { return { ok: false, error: "שגיאת רשת" }; }
}

export default function CommitteePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/committee", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "שגיאה"); else setData(j);
    } catch { setError("שגיאת רשת"); }
    setLoading(false);
  };
  useEffect(() => {
    load();
    // קישור מהתראה: /committee?building=<id> — בלי useSearchParams (לא דורש Suspense).
    const b = new URLSearchParams(window.location.search).get("building");
    if (b) setOpen(b);
  }, []);

  const match = (b: { name: string } | BRef) => !q || b.name.toLowerCase().includes(q.toLowerCase());
  const pending = useMemo(() => (data?.pending ?? []).filter((p) => match(p.building)), [data, q]);
  const handovers = useMemo(() => (data?.handovers ?? []).filter((h) => match(h.building)), [data, q]);
  const risk = useMemo(() => (data?.risk?.rows ?? []).filter((r) => match(r)), [data, q]);
  const history = useMemo(() => (data?.history ?? []).filter((h) => match(h.building)), [data, q]);
  const riskCount = (data?.risk?.counts.orphan ?? 0) + (data?.risk?.counts.single_no_deputy ?? 0);

  const TABS: { key: Tab; label: string; n?: number; hot?: boolean }[] = [
    { key: "pending", label: "בקשות פתוחות", n: data?.pending?.length ?? 0, hot: (data?.pending?.length ?? 0) > 0 },
    { key: "handover", label: "בהעברה", n: data?.handovers?.length ?? 0 },
    { key: "risk", label: "בסיכון", n: riskCount },
    { key: "history", label: "היסטוריה (60 יום)" },
  ];

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "22px", fontWeight: 800 }}>המשכיות ועד</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
            ראש ועד שלא יכול להמשיך, ממלאי מקום, והעברת המנוי לוועד החדש
          </p>
        </div>
        <button onClick={load} disabled={loading} style={ghostBtn}><RefreshCw size={14} /> רענון</button>
      </div>

      {data && !data.available && (
        <Notice tone="yellow">מיגרציה 133 (המשכיות ועד) עוד לא רצה ב-bloc — אין מה להציג.</Notice>
      )}
      {data?.available && data.canManage && !data.configured && (
        <Notice tone="yellow">
          הצפייה עובדת, אבל הפעולות לא זמינות: ב-Vercel של הפאנל חסרים <code>BLOC_APP_URL</code> ו/או <code>PANEL_ACTION_SECRET</code> (אותו ערך כמו ב-bloc).
        </Notice>
      )}
      {error && <div className="card" style={{ padding: "16px", color: "var(--red)" }}>{error}</div>}

      {data?.available && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <div className="chips">
              {TABS.map((t) => (
                <button key={t.key} className={`chip${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)} style={{ fontSize: "13px", padding: "7px 14px" }}>
                  {t.label}{t.n ? ` (${t.n})` : ""}{t.hot && tab !== t.key ? " •" : ""}
                </button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בניין"
              style={{ flex: 1, minWidth: "140px", ...input }} />
          </div>

          {loading && <div className="card" style={{ padding: "24px", color: "var(--text-3)" }}>טוען…</div>}

          {!loading && tab === "pending" && (
            pending.length === 0 ? <Empty text="אין בקשות פתוחות" /> :
            <List>{pending.map((p) => <PendingCard key={p.id} p={p} canManage={!!data.canManage && !!data.configured} canExecute={!!data.canExecute && !!data.configured} onOpen={() => setOpen(p.building.id)} onDone={load} />)}</List>
          )}
          {!loading && tab === "handover" && (
            handovers.length === 0 ? <Empty text="אין בניינים בהעברת ועד" /> :
            <List>{handovers.map((h) => <HandoverCard key={h.id} h={h} canManage={!!data.canManage && !!data.configured} onOpen={() => setOpen(h.building.id)} onDone={load} />)}</List>
          )}
          {!loading && tab === "risk" && (
            <>
              <div className="card" style={{ padding: "12px 16px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                <b>{data.risk?.counts.orphan ?? 0}</b> בניינים בלי ועד פעיל · <b>{data.risk?.counts.single_no_deputy ?? 0}</b> עם ועד יחיד בלי ממלא מקום
                {" "}(מתוך {data.risk?.counts.buildings ?? 0}). בבניינים האלה, אם ראש הוועד ייעלם — אף אחד בבניין לא יוכל לבקש החלפה, והפנייה תגיע אלינו.
                {data.risk?.partial && <span style={{ color: "var(--yellow)" }}> · הרשימה חלקית (תקרת קריאה).</span>}
              </div>
              {risk.length === 0 ? <Empty text="אין בניינים בסיכון" /> :
                <List>{risk.map((r) => <RiskRow key={r.id} r={r} onOpen={() => setOpen(r.id)} />)}</List>}
            </>
          )}
          {!loading && tab === "history" && (
            history.length === 0 ? <Empty text="אין היסטוריה ב-60 הימים האחרונים" /> :
            <List>{history.map((h) => <HistoryRow key={h.id} h={h} onOpen={() => setOpen(h.building.id)} />)}</List>
          )}
        </>
      )}

      {open && <BuildingDrawer id={open} onChanged={load} onClose={() => {
        setOpen(null);
        if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
      }} />}
    </div>
  );
}

// ── כרטיסים ────────────────────────────────────────────────────────────────

function PendingCard({ p, canManage, canExecute, onOpen, onDone }: { p: Pending; canManage: boolean; canExecute: boolean; onOpen: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<null | "cancel" | "execute">(null);
  const cd = countdown(p.executeAfter);
  return (
    <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", borderColor: cd.urgent ? "#ef444450" : "#eab30840" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <button onClick={onOpen} style={linkBtn}>{p.building.name}</button>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>נפתחה {ilDateTime(p.createdAt)}</div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="badge badge-orange">{p.reasonLabel}</span>
          {p.viaPanel && <span className="badge badge-blue">נפתחה ע״י הצוות</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700, color: cd.urgent ? "var(--red)" : "var(--yellow)" }}>
        <Clock size={15} /> ההחלפה מתבצעת {cd.due ? "בריצה הקרובה" : cd.text} · {ilDateTime(p.executeAfter)}
      </div>
      <PersonLine label="מבקש/ת (ייכנס/תיכנס לתפקיד)" p={p.requester} />
      <PersonLine label="ראש הוועד הנוכחי" p={p.head} withContact />
      {p.note && <div style={{ fontSize: "13px", color: "var(--text-2)" }}>הערת המבקש: {p.note}</div>}
      {p.panelNote && <InternalNote actor={p.panelActor} note={p.panelNote} />}
      {canManage && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {canExecute && <button onClick={() => setMode(mode === "execute" ? null : "execute")} style={solidBtn("#ef4444")}><CheckCircle2 size={14} />ביצוע מיידי</button>}
          <button onClick={() => setMode(mode === "cancel" ? null : "cancel")} style={ghostBtn}><ShieldX size={14} />ביטול הבקשה</button>
        </div>
      )}
      {mode === "execute" && (
        <ActionForm
          color="#ef4444" submit="בצע עכשיו"
          hint="ראש הוועד הנוכחי יאבד את הרשאות הוועד מיד, המנוי שלו יבוטל והוראת הקבע תיעצר, והמבקש/ת יהפוך/תהפוך לראש הוועד. לפני 72 השעות — רק כשהנסיבות אומתו (למשל תעודת פטירה, או שיחה עם ראש הוועד שמאשר)."
          confirmText="אימתתי את הנסיבות ואת זהות המבקש/ת, ואני מבין/ה שזה מיידי"
          onSubmit={(panel_note) => post({ action: "execute", request_id: p.id, panel_note, confirm: true })}
          onDone={() => { setMode(null); onDone(); }} />
      )}
      {mode === "cancel" && (
        <ActionForm
          color="#71717a" submit="בטל את הבקשה"
          hint="ראש הוועד ממשיך בתפקיד. המבקש/ת וראש הוועד יקבלו הודעה שהבקשה בוטלה ע״י צוות bloc."
          onSubmit={(panel_note) => post({ action: "cancel", request_id: p.id, panel_note })}
          onDone={() => { setMode(null); onDone(); }} />
      )}
    </div>
  );
}

function HandoverCard({ h, canManage, onOpen, onDone }: { h: Handover; canManage: boolean; onOpen: () => void; onDone: () => void }) {
  const [extending, setExtending] = useState(false);
  const cd = h.deadline ? countdown(h.deadline) : null;
  const options = h.needsPayment && h.deadline ? extendOptions({ executedAt: h.executedAt, deadline: h.deadline }) : [];
  const [until, setUntil] = useState<string>("");
  return (
    <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", borderColor: h.expired ? "#ef444450" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <button onClick={onOpen} style={linkBtn}>{h.building.name}</button>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>הוחלף {ilDateTime(h.executedAt)} · {EXEC_MODE_LABEL[h.executedMode ?? ""] ?? "—"}</div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {h.needsPayment && <span className={`badge ${h.expired ? "badge-red" : "badge-yellow"}`}>{h.expired ? "לא הוזן תשלום — רדום" : "ממתין לאמצעי תשלום"}</span>}
          {h.collectionHeld && <span className="badge badge-orange">גבייה מושהית</span>}
        </div>
      </div>
      {h.needsPayment && h.deadline && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: 700, color: h.expired ? "var(--red)" : "var(--text)" }}>
          <Calendar size={15} /> מועד: {ilDate(h.deadline)} סוף היום{cd && !cd.due ? ` · ${cd.text}` : ""}
        </div>
      )}
      <PersonLine label="ראש הוועד החדש" p={h.newHead} withContact />
      {h.remindersSent.length > 0 && <div style={{ fontSize: "12px", color: "var(--text-3)" }}>תזכורות שנשלחו: {h.remindersSent.map((r) => ({ d4: "4 ימים לפני", d1: "יום לפני", d0: "ביום המועד" } as Record<string, string>)[r] ?? r).join(" · ")}</div>}
      {h.panelNote && <InternalNote actor={null} note={h.panelNote} />}
      {canManage && options.length > 0 && (
        <div>
          <button onClick={() => setExtending(!extending)} style={ghostBtn}><Calendar size={14} />הארכת מועד</button>
        </div>
      )}
      {canManage && h.needsPayment && options.length === 0 && (
        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>אי אפשר להאריך יותר — עד 30 יום מיום ההחלפה.</div>
      )}
      {extending && (
        <ActionForm
          color="#3b82f6" submit="האריכו"
          extra={
            <div className="chips">
              {options.map((o) => (
                <button key={o.days} type="button" className={`chip${until === o.until ? " active" : ""}`} onClick={() => setUntil(o.until)}>
                  +{o.days} ימים · עד {ilDate(o.until)}
                </button>
              ))}
            </div>
          }
          hint="הבניין נשאר פתוח עד התאריך החדש, והתזכורות לוועד החדש מתחילות מחדש לפיו. אפשר להאריך עד 30 יום מיום ההחלפה."
          disabled={!until}
          onSubmit={(panel_note) => post({ action: "extend", request_id: h.id, until, panel_note })}
          onDone={() => { setExtending(false); onDone(); }} />
      )}
    </div>
  );
}

function RiskRow({ r, onOpen }: { r: Risk; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", textAlign: "right", cursor: "pointer", color: "var(--text)", width: "100%" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: 700 }}>{r.name}</div>
        <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
          {r.head ? `ראש ועד: ${r.head.name}` : "אין ראש ועד"} · {r.members} חברים פעילים
        </div>
      </div>
      <span className={`badge ${r.level === "orphan" ? "badge-red" : "badge-yellow"}`} style={{ flexShrink: 0 }}>{RISK_LABEL[r.level]}</span>
    </button>
  );
}

function HistoryRow({ h, onOpen }: { h: History; onOpen: () => void }) {
  const executed = h.status === "executed";
  return (
    <div className="card" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
        <button onClick={onOpen} style={{ ...linkBtn, fontSize: "14px" }}>{h.building.name}</button>
        <span className={`badge ${executed ? "badge-green" : "badge-muted"}`}>{executed ? "בוצעה" : "בוטלה"}</span>
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
        {ilDateTime(h.at)} · {h.reasonLabel} · {h.requester?.name ?? "—"} במקום {h.head?.name ?? "—"}
        {" · "}{executed ? (EXEC_MODE_LABEL[h.executedMode ?? ""] ?? "") : (CANCEL_KIND_LABEL[h.cancelKind ?? ""] ?? "")}
        {h.panelActor ? ` · ${h.panelActor}` : ""}
      </div>
      {h.panelNote && <div style={{ fontSize: "12px", color: "var(--text-2)" }}>תיעוד: {h.panelNote}</div>}
    </div>
  );
}

// ── פרטי בניין + פתיחת בקשה ─────────────────────────────────────────────────

type Member = Person & { role: string; isHead: boolean };
type Detail = {
  available: boolean; canManage: boolean; canExecute: boolean; configured: boolean;
  building: { id: string; name: string; address: string | null; archived: boolean; subscriptionStatus: string | null; planExpires: string | null };
  head: Person | null; deputy: (Person & { status: string; since: string | null }) | null; admins: number; members: Member[];
  pendingId: string | null; collectionHeld: boolean;
  requests: { id: string; status: string; requester: Person | null; head: Person | null; reasonLabel: string; executeAfter: string; executedAt: string | null; cancelledAt: string | null; cancelKind: string | null; executedMode: string | null; billingDeadline: string | null; viaPanel: boolean; panelNote: string | null; panelActor: string | null }[];
};

function BuildingDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [appoint, setAppoint] = useState(false);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState<SuccessionReason>("deceased");
  const [note, setNote] = useState("");

  const load = async () => {
    setErr("");
    try {
      const r = await fetch(`/api/committee?building=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "שגיאה"); else setD(j);
    } catch { setErr("שגיאת רשת"); }
  };
  useEffect(() => { load(); }, [id]);

  const candidates = (d?.members ?? []).filter((m) => !m.isHead);
  const canAppoint = !!d?.canManage && !!d?.configured && !d?.pendingId && !d?.building.archived && candidates.length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: "560px", maxHeight: "92dvh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "18px", fontWeight: 800 }}>{d?.building.name ?? "טוען…"}</div>
            {d?.building.address && <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{d.building.address}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px" }}><X size={18} /></button>
        </div>
        {err && <div style={{ color: "var(--red)", fontSize: "13px" }}>{err}</div>}
        {d && !d.available && <Notice tone="yellow">מיגרציה 133 עוד לא רצה ב-bloc.</Notice>}

        {d?.available && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "8px" }}>
              <Fact label="חברי ועד פעילים" value={String(d.admins)} />
              <Fact label="ממלא מקום" value={d.deputy ? `${d.deputy.name}${d.deputy.status === "pending" ? " (טרם אישר)" : ""}` : "אין"} />
              <Fact label="מנוי" value={d.building.subscriptionStatus === "succession" ? `העברת ועד · עד ${ilDate(d.building.planExpires)}` : (SUB_LABEL[d.building.subscriptionStatus ?? ""] ?? d.building.subscriptionStatus ?? "—")} />
              <Fact label="גבייה מקוונת" value={d.collectionHeld ? "מושהית עד אישור הוועד" : "רגילה"} />
            </div>
            <PersonLine label="ראש הוועד" p={d.head} withContact />
            {d.deputy && <PersonLine label="ממלא/ת מקום" p={d.deputy} withContact />}

            {d.pendingId && <Notice tone="yellow">יש בקשה פתוחה — הפעולות עליה בלשונית "בקשות פתוחות".</Notice>}

            {canAppoint && !appoint && (
              <button onClick={() => setAppoint(true)} style={{ ...ghostBtn, justifyContent: "center" }}><Users size={14} />פתיחת בקשה בשם דייר/ת</button>
            )}
            {appoint && (
              <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
                  {d.head
                    ? <>למקרה שאין בבניין מי שיכול לבקש בעצמו (אין ממלא מקום, וראש הוועד הוא הוועד היחיד). ראש הוועד מקבל התראה ומייל,
                      ויכול ללחוץ &quot;אני כאן&quot; תוך 72 שעות. אחרי 72 שעות — הדייר/ת נכנס/ת לתפקיד, והמנוי עובר אליו/ה עם 7 ימים להזנת תשלום.</>
                    : <>לבניין אין ראש ועד פעיל, כך שאין מי שיקבל התראה או ילחץ &quot;אני כאן&quot;. הבקשה תתבצע אוטומטית אחרי 72 שעות,
                      או מיד — בלשונית &quot;בקשות פתוחות&quot; (סופר-אדמין). המנוי עובר לדייר/ת עם 7 ימים להזנת תשלום.</>}
                </div>
                <label style={lbl}>מי ייכנס לתפקיד
                  <select value={userId} onChange={(e) => setUserId(e.target.value)} style={input}>
                    <option value="">בחרו דייר/ת…</option>
                    {candidates.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.apartment ? ` · דירה ${m.apartment}` : ""}{m.role === "admin" ? " · ועד" : ""}</option>
                    ))}
                  </select>
                </label>
                <label style={lbl}>סיבה
                  <select value={reason} onChange={(e) => setReason(e.target.value as SuccessionReason)} style={input}>
                    {(Object.keys(REASON_LABEL) as SuccessionReason[]).map((k) => <option key={k} value={k}>{REASON_LABEL[k]}</option>)}
                  </select>
                </label>
                <label style={lbl}>הערה בבקשה (אופציונלי)
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={input} placeholder="למשל: לפי החלטת אסיפת דיירים" />
                </label>
                <ActionForm
                  color="#f97316" submit="פתחו בקשה (72 שעות)"
                  hint="התיעוד פנימי — לא מוצג לדיירים."
                  confirmText="אימתתי את הנסיבות ואת זהות הדייר/ת (פרוטוקול / תעודה / שיחה), והתיעוד מלא"
                  disabled={!userId}
                  onSubmit={(panel_note) => post({ action: "request", building_id: d.building.id, user_id: userId, reason, note: note.trim() || null, panel_note, confirm: true })}
                  onDone={() => { setAppoint(false); load(); onChanged(); }} />
              </div>
            )}

            {d.requests.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)" }}>בקשות בבניין</div>
                {d.requests.map((r) => (
                  <div key={r.id} style={{ fontSize: "12px", color: "var(--text-2)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 10px", lineHeight: 1.6 }}>
                    <b>{r.status === "pending" ? "פתוחה" : r.status === "executed" ? "בוצעה" : "בוטלה"}</b>
                    {" · "}{r.requester?.name ?? "—"} במקום {r.head?.name ?? "—"} · {r.reasonLabel}
                    {" · "}{r.status === "pending" ? `מתבצעת ${ilDateTime(r.executeAfter)}` : r.status === "executed" ? `${ilDateTime(r.executedAt)} · ${EXEC_MODE_LABEL[r.executedMode ?? ""] ?? ""}` : `${ilDateTime(r.cancelledAt)} · ${CANCEL_KIND_LABEL[r.cancelKind ?? ""] ?? ""}`}
                    {r.panelActor && <div style={{ color: "var(--text-3)" }}>{r.panelActor}{r.panelNote ? `: ${r.panelNote}` : ""}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── רכיבים קטנים ────────────────────────────────────────────────────────────

function ActionForm({ color, submit, hint, confirmText, extra, disabled, onSubmit, onDone }: {
  color: string; submit: string; hint: string; confirmText?: string; extra?: React.ReactNode; disabled?: boolean;
  onSubmit: (panelNote: string) => Promise<{ ok: boolean; error?: string }>; onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [ok, setOk] = useState(!confirmText);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ready = note.trim().length >= 10 && ok && !disabled && !busy;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: color + "10", border: `1px solid ${color}30`, borderRadius: "10px", padding: "12px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.6, display: "flex", gap: "6px" }}><Info size={14} style={{ flexShrink: 0, marginTop: "2px" }} />{hint}</div>
      {extra}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000}
        placeholder="תיעוד (חובה, 10+ תווים): מה אומת, מול מי ואיך — נשמר ביומן"
        style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
      {confirmText && (
        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12px", color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ marginTop: "2px" }} />{confirmText}
        </label>
      )}
      <button disabled={!ready} style={{ ...solidBtn(color), opacity: ready ? 1 : 0.5, justifyContent: "center" }}
        onClick={async () => {
          setBusy(true); setMsg(null);
          const r = await onSubmit(note.trim());
          setBusy(false);
          if (!r.ok) { setMsg(r.error ?? "הפעולה נכשלה"); return; }
          onDone();
        }}>
        {busy ? "שולח…" : submit}
      </button>
      {msg && <div style={{ fontSize: "12px", color: "var(--red)" }}>{msg}</div>}
    </div>
  );
}

function PersonLine({ label, p, withContact }: { label: string; p: Person | null; withContact?: boolean }) {
  return (
    <div style={{ fontSize: "13px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ color: "var(--text-3)" }}>{label}:</span>
      <b>{p?.name ?? "—"}</b>
      {p?.apartment && <span style={{ color: "var(--text-3)" }}>דירה {p.apartment}</span>}
      {withContact && p?.email && <a href={`mailto:${p.email}`} style={contact}><Mail size={12} />{p.email}</a>}
      {withContact && p?.phone && <a href={`tel:${p.phone}`} style={contact}><Phone size={12} /><span dir="ltr">{p.phone}</span></a>}
    </div>
  );
}

function InternalNote({ actor, note }: { actor: string | null; note: string }) {
  return <div style={{ fontSize: "12px", color: "var(--text-3)", borderRight: "2px solid var(--border)", paddingRight: "8px" }}>תיעוד צוות{actor ? ` (${actor})` : ""}: {note}</div>;
}

function Notice({ tone, children }: { tone: "yellow"; children: React.ReactNode }) {
  const c = tone === "yellow" ? "#eab308" : "#71717a";
  return <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "12px 14px", borderRadius: "10px", background: c + "12", border: `1px solid ${c}35`, fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}><AlertTriangle size={15} color={c} style={{ flexShrink: 0, marginTop: "2px" }} /><div>{children}</div></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
      <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const SUB_LABEL: Record<string, string> = {
  active: "פעיל", trial: "ניסיון", trialing: "ניסיון", past_due: "חוב תשלום", cancel_pending: "בוטל — פעיל עד סוף התקופה",
  cancelled: "בוטל", canceled: "בוטל", expired: "פג", none: "ללא",
};

const List = ({ children }: { children: React.ReactNode }) => <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{children}</div>;
const Empty = ({ text }: { text: string }) => <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>{text}</div>;

const input: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: "13px" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--text-3)" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "var(--text)", fontSize: "15px", fontWeight: 700, cursor: "pointer", textAlign: "right" };
const contact: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--blue)", textDecoration: "none", fontSize: "12px" };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "13px", cursor: "pointer" };
const solidBtn = (bg: string): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 14px", borderRadius: "8px", border: "none", background: bg, color: "white", fontSize: "13px", fontWeight: 700, cursor: "pointer" });
