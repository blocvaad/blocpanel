"use client";
// contentReports/ContentReportsClient — bloc SAFETY-1 (MG-S1241, החלטות 676–677): התור של הדיווחים על תוכן, והפריט שנפתח בתוכו.
//   • התור (מ-/api/content-reports, לא ב-HTML): פריט לכל דבר שדווח — הסוג, הבניין, מי כתב (וכמה דיווחים פתוחים יש עליו), כמה דיווחים
//     ומאילו סיבות, מתי, ומצב ההסתרה ("מוסתר אוטומטית" אחרי 3). בלי תוכן ובלי מי דיווח.
//   • "פתיחה" — POST /api/content-reports/one (נרשם ב-bloc לפני התוכן וביומן הפאנל): העותקים מרגע הדיווח, התוכן עכשיו, הדיווחים (סיבה,
//     הערה, מתי) — ושלוש החלטות: להסתיר לכולם (עם סיבה, לא חובה), להשאיר (חוזר ומוצג, הדיווחים נסגרים), להעביר לוועד (לא הודעה על
//     מודעה — שיחה של שניים). הצלחה רק כש-bloc אישר; אחרת המשפט שלו.
//   • שלושה מצבים נפרדים לתור: טוען, כשל ("וזה לא אומר שאין דיווחים"), ריק.
import { useCallback, useEffect, useState } from "react";
import { Banner, Tag, ghostBtn, solidBtn, textareaStyle } from "@/components/ui/panelKit";
import {
  CR_EMPTY_FILTERED_TEXT, CR_EMPTY_TEXT, CR_FAILED_TEXT, CR_NOTE_MAX, CR_PRIVACY_TEXT, CR_REASON_LABEL, CR_SOURCES, CR_SOURCE_LABEL,
  CR_SQL_MISSING_TEXT, CR_STATUS_LABEL, authorLine, crApiUrl, crDoneText, hiddenText, parseCrList, parseCrReport, reasonsText,
  type CrAction, type CrFilter, type CrItem, type CrReport,
} from "@/lib/contentReports";
import { agoText } from "@/lib/sla";
import type { CrQueueData } from "@/lib/contentReportsServer";

type Queue = CrQueueData | { state: "loading" };

/** תשובת /api/content-reports → מה שהתצוגה מקבלת. צורה לא מוכרת — כשל, לא "אין דיווחים". */
export function queueFromReply(status: number, j: unknown): CrQueueData {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  if (o.state === "missing") return { state: "missing" };
  if (status >= 200 && status < 300 && o.state === "ok") {
    const l = parseCrList({ ok: true, items: o.items, open_total: o.openTotal, truncated: o.truncated });
    if (l) return { state: "ok", ...l };
  }
  return { state: "error", message: typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : "" };
}

const chip = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", minHeight: "44px", padding: "0 14px", borderRadius: "99px", fontSize: "14px", fontWeight: 600,
  border: `1px solid ${active ? "var(--text)" : "var(--border)"}`, background: active ? "var(--text)" : "transparent", color: active ? "var(--bg)" : "var(--text-2)",
  textDecoration: "none", whiteSpace: "nowrap",
});
const href = (f: CrFilter, change: Partial<CrFilter>) => {
  const n = { ...f, ...change };
  const q = new URLSearchParams();
  if (n.status !== "open") q.set("status", n.status);
  if (n.source) q.set("source", n.source);
  if (n.order !== "newest") q.set("order", n.order);
  const s = q.toString();
  return s ? `/content-reports?${s}` : "/content-reports";
};

type DetailState = { state: "loading" } | { state: "ok"; report: CrReport } | { state: "error"; message: string };
const NOT_FOUND_TEXT = "אין דיווחים על הפריט הזה. רעננו את הרשימה.";
const OPEN_FAILED_TEXT = "הפתיחה נכשלה. נסו שוב.";
export const UNCLEAR_TEXT = "לא ברור אם הפעולה בוצעה. רעננו את הדף.";

/** תשובת /api/content-reports/one → מה שהפריט מציג. צורה לא מוכרת — כשל, לא פריט ריק. */
export function detailFromReply(ok: boolean, j: unknown): DetailState {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const report = ok && o.state === "ok" ? parseCrReport({ ok: true, report: o.report }) : null;
  if (report) return { state: "ok", report };
  return { state: "error", message: typeof o.message === "string" && o.message ? o.message : o.state === "not_found" ? NOT_FOUND_TEXT : OPEN_FAILED_TEXT };
}

/** תשובת POST /api/content-reports → הצלחה רק כש-bloc אישר (ok: true); אחרת המשפט, ובלי משפט — "לא ברור אם בוצע". */
export function actionFromReply(ok: boolean, j: unknown, action: CrAction["action"]): { done: string } | { fail: string } {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  if (ok && o.ok === true) {
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { done: crDoneText(action, { changed: o.changed === true, closed: n(o.closed), notified: o.notified === true }) };
  }
  return { fail: typeof o.error === "string" && o.error ? o.error : UNCLEAR_TEXT };
}

/** הפריט שנפתח (תצוגה בלבד): התוכן עכשיו, העותקים מרגע הדיווח, הדיווחים — ולמי שמנהל, שלוש ההחלטות. */
export function CrDetailView({ item, report: r, canManage, note, busy, fail, now, onNote, onAct }: {
  item: CrItem; report: CrReport; canManage: boolean; note: string; busy: CrAction["action"] | null; fail: string | null; now: number;
  onNote: (v: string) => void; onAct: (a: CrAction["action"]) => void
}) {
  const privateThread = item.source === "market_comment";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-cr-detail="">
      <div>
        <p style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600 }}>התוכן עכשיו{r.current?.has_image ? " · עם תמונה" : ""}</p>
        {r.current
          ? <p style={{ fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} data-cr-current=""><bdi>{r.current.text}</bdi></p>
          : <p style={{ fontSize: "14px", color: "var(--text-2)" }} data-cr-current-gone="">{privateThread ? "הודעה בשיחה על מודעה — התוכן רק בעותק מרגע הדיווח." : "נמחק מאז הדיווח. העותקים למטה."}</p>}
      </div>
      {r.snapshots.length > 0 && (
        <div>
          <p style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600 }}>מה דווח (עותק מרגע הדיווח{r.snapshots.length > 1 ? "; נערך בין דיווח לדיווח" : ""})</p>
          {r.snapshots.map((s, i) => (
            <p key={i} style={{ fontSize: "14.5px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "8px 10px", borderRadius: "8px", background: "var(--card)", marginTop: "6px" }} data-cr-snapshot="">
              <bdi>{s}</bdi>
            </p>
          ))}
        </div>
      )}
      <div>
        <p style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 600 }}>הדיווחים</p>
        <ul style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
          {r.reports.map((x, i) => (
            <li key={i} style={{ fontSize: "14px", lineHeight: 1.5 }} data-cr-report={x.reason}>
              {CR_REASON_LABEL[x.reason]} · {agoText(x.at, now)}{x.status !== "open" ? ` · ${CR_STATUS_LABEL[x.status]}` : ""}
              {x.note && <><br/><span style={{ color: "var(--text-2)" }}>&quot;<bdi>{x.note}</bdi>&quot;</span></>}
            </li>
          ))}
        </ul>
      </div>
      {canManage && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-cr-actions="">
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13.5px", color: "var(--text-2)" }}>
            סיבה / הערה ליומן (לא חובה; מי שכתב לא רואה אותה)
            <textarea value={note} onChange={(e) => onNote(e.target.value.slice(0, CR_NOTE_MAX))} rows={2} maxLength={CR_NOTE_MAX} style={textareaStyle} data-cr-note=""/>
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => onAct("hide")} disabled={!!busy} style={solidBtn("#ef4444")} data-cr-hide="">
              {busy === "hide" ? "…" : item.hidden === "auto" ? "להשאיר מוסתר" : item.hidden ? "מוסתר — לסגור את הדיווחים" : "להסתיר לכולם"}
            </button>
            <button type="button" onClick={() => onAct("restore")} disabled={!!busy} style={ghostBtn} data-cr-restore="">
              {busy === "restore" ? "…" : item.hidden ? "להחזיר ולהציג" : "תקין, להשאיר"}
            </button>
            {!privateThread && !item.hidden && (
              <button type="button" onClick={() => onAct("refer")} disabled={!!busy} style={ghostBtn} data-cr-refer="">
                {busy === "refer" ? "…" : "להעביר לוועד"}
              </button>
            )}
          </div>
          {privateThread && <p style={{ fontSize: "13px", color: "var(--text-2)" }} data-cr-private="">שיחה של שניים על מודעה — לא מעבירים לוועד.</p>}
          {!privateThread && item.hidden && <p style={{ fontSize: "13px", color: "var(--text-2)" }} data-cr-no-refer="">פריט מוסתר לא מועבר לוועד — הוועד לא רואה אותו. אפשר להשאיר מוסתר או להחזיר.</p>}
          {fail && <Banner tone="error">{fail}</Banner>}
        </div>
      )}
    </div>
  );
}

function Detail({ item, canManage, onDone }: { item: CrItem; canManage: boolean; onDone: (msg: string) => void }) {
  const [data, setData] = useState<DetailState>({ state: "loading" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<CrAction["action"] | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await fetch("/api/content-reports/one", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: item.source, id: item.source_id }) });
        const j = await r.json().catch(() => null);
        if (live) setData(detailFromReply(r.ok, j));
      } catch { if (live) setData({ state: "error", message: "אין חיבור." }); }
    })();
    return () => { live = false; };
  }, [item.source, item.source_id]);

  const act = async (action: CrAction["action"]) => {
    if (busy) return;
    setBusy(action); setFail(null);
    try {
      const r = await fetch("/api/content-reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source: item.source, id: item.source_id, ...(note.trim() ? { note: note.trim() } : {}) }) });
      const j = await r.json().catch(() => null);
      const res = actionFromReply(r.ok, j, action);
      if ("done" in res) { onDone(res.done); return; }
      setFail(res.fail);
    } catch { setFail("אין חיבור. לא ברור אם הפעולה בוצעה — רעננו."); }
    finally { setBusy(null); }
  };

  if (data.state === "loading") return <p style={{ fontSize: "14px", color: "var(--text-2)" }} data-cr-detail-loading="">פותחים…</p>;
  if (data.state === "error") return <Banner tone="error">{data.message}</Banner>;
  return <CrDetailView item={item} report={data.report} canManage={canManage} note={note} busy={busy} fail={fail} now={Date.now()} onNote={setNote} onAct={(a) => { void act(a) }}/>;
}

export function CrRow({ i, now, canManage, open, onToggle, onDone }: { i: CrItem; now: number; canManage: boolean; open: boolean; onToggle: () => void; onDone: (m: string) => void }) {
  const hid = hiddenText(i.hidden);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "14px", border: `1px solid ${i.hidden === "auto" ? "#ef444466" : "var(--border)"}` }}
      data-cr-row={i.status} data-cr-source={i.source}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <Tag tone={i.status === "open" ? "wait" : i.status === "hidden" ? "danger" : "ok"}>{CR_STATUS_LABEL[i.status]}</Tag>
        <Tag tone="info">{CR_SOURCE_LABEL[i.source]}</Tag>
        {hid && <Tag tone="danger">{hid}</Tag>}
        {i.notes > 0 && <Tag tone="muted">{i.notes === 1 ? "עם הערה" : `${i.notes} הערות`}</Tag>}
      </div>
      <div style={{ fontSize: "15px", lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700 }} data-cr-author=""><bdi>{authorLine(i)}</bdi></div>
        <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-cr-building=""><bdi>{i.building.name}</bdi></div>
      </div>
      <div style={{ fontSize: "13.5px", color: "var(--text-2)" }} data-cr-reasons="">{reasonsText(i)} · {agoText(i.last_at, now)}</div>
      <div>
        <button type="button" onClick={onToggle} style={ghostBtn} aria-expanded={open} data-cr-open="">{open ? "סגירה" : "פתיחה (נרשמת ביומן)"}</button>
      </div>
      {open && <Detail item={i} canManage={canManage} onDone={onDone}/>}
    </div>
  );
}

export function ContentReportsView({ data, filter, now, canManage, onRetry, onDone, message }: {
  data: Queue; filter: CrFilter; now: number; canManage: boolean; onRetry?: () => void; onDone: (m: string) => void; message?: string | null
}) {
  const [open, setOpen] = useState<string | null>(null);
  const head = (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 800 }}>דיווחים על תוכן</h1>
      <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.6 }} data-cr-privacy="">
        הודעות בצ&apos;אט הבניין, בקשות ותגובות בלוח, מודעות בשוק והודעות על מודעה. אחרי 3 דיווחים של דיירים שונים הפריט מוסתר אוטומטית עד ההחלטה כאן. {CR_PRIVACY_TEXT}
      </p>
    </div>
  );
  if (data.state === "missing") return <>{head}<Banner tone="warn">{CR_SQL_MISSING_TEXT}</Banner></>;
  const tabs = (
    <nav aria-label="מצב" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} data-cr-tabs="">
      {(["open", "closed", "all"] as const).map((s) => (
        <a key={s} href={href(filter, { status: s })} style={chip(filter.status === s)} aria-current={filter.status === s ? "page" : undefined}>
          {s === "open" ? `פתוחים${data.state === "ok" && data.openTotal !== null && !filter.source ? ` (${data.openTotal})` : ""}` : s === "closed" ? "שנסגרו" : "הכל"}
        </a>
      ))}
      <span style={{ width: "8px" }}/>
      <a href={href(filter, { source: null })} style={chip(!filter.source)}>כל הסוגים</a>
      {CR_SOURCES.map((s) => <a key={s} href={href(filter, { source: s })} style={chip(filter.source === s)} data-cr-source-chip={s}>{CR_SOURCE_LABEL[s]}</a>)}
    </nav>
  );
  return (
    <>
      {head}
      {tabs}
      {message && <Banner tone="ok">{message}</Banner>}
      {data.state === "loading" && <p style={{ fontSize: "14px", color: "var(--text-2)" }} data-cr-loading="">טוענים…</p>}
      {data.state === "error" && <Banner tone="error" action={onRetry ? <button type="button" onClick={onRetry} style={ghostBtn}>נסו שוב</button> : undefined}>{data.message || CR_FAILED_TEXT}</Banner>}
      {data.state === "ok" && data.items.length === 0 && <p style={{ fontSize: "15px", color: "var(--text-2)" }} data-cr-empty="">{filter.source || filter.status !== "open" ? CR_EMPTY_FILTERED_TEXT : CR_EMPTY_TEXT}</p>}
      {data.state === "ok" && data.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-cr-list={data.items.length}>
          {data.items.map((i) => {
            const k = `${i.source}:${i.source_id}`;
            return <CrRow key={k} i={i} now={now} canManage={canManage} open={open === k} onToggle={() => setOpen(open === k ? null : k)} onDone={(m) => { setOpen(null); onDone(m) }}/>;
          })}
          {data.truncated && <p style={{ fontSize: "13px", color: "var(--text-2)" }}>מוצגים 1,000 הדיווחים האחרונים. סננו לפי סוג כדי לראות יותר.</p>}
        </div>
      )}
    </>
  );
}

export default function ContentReportsClient({ filter, canManage }: { filter: CrFilter; canManage: boolean }) {
  const [data, setData] = useState<Queue>({ state: "loading" });
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const url = crApiUrl(filter);
  const load = useCallback(async (signal?: AbortSignal) => {
    setData({ state: "loading" });
    try {
      const r = await fetch(url, { credentials: "include", cache: "no-store", signal });
      const j = await r.json().catch(() => null);
      setNow(Date.now());
      setData(queueFromReply(r.status, j));
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setData({ state: "error", message: "אין חיבור." });
    }
  }, [url]);
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  return <ContentReportsView data={data} filter={filter} now={now} canManage={canManage} message={message}
    onRetry={() => { void load() }} onDone={(m) => { setMessage(m); void load() }}/>;
}
