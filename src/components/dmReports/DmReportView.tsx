"use client";
// dmReports/DmReportView — MOD-1 (bloc MG-S1179, החלטות 520, 584–585): דיווח אחד על שיחה פרטית. מי דיווח על מי ובאיזה בניין (קישורים
// לדף של כל אחד ולבניין, וכמה דיווחים נוספים יש עליו / ממנו), מה המדווח/ת כתב/ה, ההודעות שצורפו (טקסט רק של הודעה שאומתה מול
// המוצפן), קבצים שנפתחים רק אצל איש הצוות ("לפתוח" — נרשם ביומן; הפתיחה בדפדפן), "נבדק" עם הערה והודעה למדווח/ת (אפשר בלי),
// "להחזיר לתור", וההיסטוריה (מי פתח ומה נעשה). DmReportDetailView — התצוגה (טהורה, לבדיקות ולצילומים); DmReportView — המצב והבקשות.
// סקירת MOD-1 (#2): הדיווח נטען מ-/api/dm-reports/one (POST, נרשם) ולא ב-HTML של הדף — ה-service worker של הפאנל שומר עותק של כל
// דף, ולא של /api/. אחרי "נבדק" / "פתיחה מחדש" — קריאה חדשה (גם היא נרשמת).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Eye, History, Lock, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Banner, Section, Tag, ghostBtn, solidBtn, fieldLabel, textareaStyle } from "@/components/ui/panelKit";
import { Initials, REASON_TONE, SLA_TONE } from "@/components/dmReports/kit";
import {
  DM_NOTE_MAX, DM_REASON_LABEL, DM_SQL_MISSING_TEXT, DM_UNVERIFIED_TEXT, MEDIA_LABEL, agoText, collapseHistory, countsText, dmSla, historyAction, sizeText, whenText,
  type DmMedia, type DmMediaKind, type DmMessage, type DmReport,
} from "@/lib/dmReports";
import { openReportedMedia } from "@/lib/dmMediaClient";

export type Opened = { state: "loading" } | { state: "open"; url: string; kind: DmMediaKind } | { state: "error"; error: string };

export const MEDIA_HINT = "קובץ נפתח רק אצלך, בדפדפן, ונרשם ביומן. הוא לא נשמר בפאנל.";
export const NOTE_HINT = "ההערה נשמרת ביומן ומוצגת רק לצוות. בלי לצטט את ההודעות עצמן.";
export const ALREADY_CHECKED_TEXT = "הדיווח כבר סומן כנבדק (כנראה על ידי מישהו אחר מהצוות). ההערה שלך לא נשמרה, והיא עדיין כאן.";
export const VERIFIED_HINT = "טקסט של הודעה שאומתה הוא בדיוק מה שנשלח: הוא נבדק מול המוצפן כשהדיווח נשלח.";

function PersonLine({ label, p, extra }: { label: string; p: { id: string; name: string } | null; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", minWidth: 0 }}>
      <Initials name={p?.name ?? "?"} size={38} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{label}</div>
        {p
          ? <Link href={`/tenants/${p.id}`} prefetch={false} style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", textDecoration: "none" }}><bdi>{p.name}</bdi></Link>
          : <span style={{ fontSize: "15px", color: "var(--text-2)" }}>חשבון שנמחק</span>}
        {extra}
      </div>
    </div>
  );
}

function MediaBox({ m, opened, canOpen, onOpen, onClose }: { m: DmMedia; opened?: Opened; canOpen: boolean; onOpen: () => void; onClose: () => void }) {
  const label = `${MEDIA_LABEL[m.kind]}${m.size ? ` (${sizeText(m.size)})` : ""}`;
  if (opened?.state === "open") {
    return (
      <div data-dm-media-open={m.kind} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {opened.kind === "image"
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={opened.url} alt={`${MEDIA_LABEL[m.kind]} מהדיווח`} style={{ maxWidth: "100%", maxHeight: "420px", borderRadius: "10px", objectFit: "contain", background: "#000" }} />
          : opened.kind === "video"
            ? <video src={opened.url} controls playsInline style={{ maxWidth: "100%", maxHeight: "420px", borderRadius: "10px", background: "#000" }} />
            : <audio src={opened.url} controls style={{ width: "100%" }} />}
        <div><button type="button" style={ghostBtn} onClick={onClose} data-dm-media-close=""><X size={16} aria-hidden="true" /> לסגור</button></div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div>
        <button type="button" style={ghostBtn} disabled={!canOpen || opened?.state === "loading"} onClick={onOpen} data-dm-media={m.kind}>
          <Lock size={16} aria-hidden="true" /> {opened?.state === "loading" ? "פותחים…" : `לפתוח ${label}`}
        </button>
      </div>
      {opened?.state === "error" && <div role="alert" style={{ fontSize: "13.5px", color: "#ef4444" }} data-dm-media-error="">{opened.error}</div>}
    </div>
  );
}

function Bubble({ m, names, opened, onOpen, onClose }: {
  m: DmMessage; names: { reporter: string; reported: string }; opened: Record<string, Opened>; onOpen: (id: string) => void; onClose: (id: string) => void;
}) {
  const reported = m.from === "reported";
  return (
    <div data-dm-message={m.from} data-dm-verified={m.verified ? "yes" : "no"} style={{
      alignSelf: reported ? "flex-start" : "flex-end", maxWidth: "min(560px, 92%)", display: "flex", flexDirection: "column", gap: "8px",
      padding: "12px 14px", borderRadius: "14px", border: `1px solid ${reported ? "#ef444455" : "var(--border)"}`, background: reported ? "#ef44440d" : "var(--surface)",
    }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", fontSize: "12.5px", color: "var(--text-2)" }}>
        <bdi style={{ fontWeight: 700, color: "var(--text)" }}>{reported ? names.reported : names.reporter}</bdi>
        <span>{whenText(m.at)}</span>
        {m.verified ? <Tag tone="ok">אומתה</Tag> : <Tag tone="muted">לא אומתה</Tag>}
      </div>
      {m.verified && m.text
        ? <div dir="auto" style={{ fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
        : <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{m.verified ? "הודעה בלי טקסט." : DM_UNVERIFIED_TEXT}</div>}
      {m.media.map((f) => <MediaBox key={f.id} m={f} opened={opened[f.id]} canOpen onOpen={() => onOpen(f.id)} onClose={() => onClose(f.id)} />)}
    </div>
  );
}

export interface DmReportDetailProps {
  report: DmReport; canManage: boolean; now: number;
  busy: boolean; error: string | null; done: string | null; note: string; notify: boolean; opened: Record<string, Opened>;
  onNote: (v: string) => void; onNotify: (v: boolean) => void; onReview: () => void; onReopen: () => void;
  onOpenMedia: (id: string) => void; onCloseMedia: (id: string) => void;
}

export function DmReportDetailView(p: DmReportDetailProps) {
  const r = p.report;
  const sla = dmSla(r, p.now);
  const names = { reporter: r.reporter?.name ?? "המדווח/ת", reported: r.reported?.name ?? "מי שדווח/ה עליו/ה" };
  const about = r.others.about_reported, by = r.others.by_reporter;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Link href="/dm-reports" prefetch={false} style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "44px", color: "var(--blue)", fontSize: "14.5px", textDecoration: "none" }}>
          <ChevronRight size={16} aria-hidden="true" /> כל הדיווחים
        </Link>
        <h1 style={{ fontSize: "22px", fontWeight: 800 }}>דיווח על שיחה פרטית</h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }} data-dm-head="">
          {sla ? <Tag tone={SLA_TONE[sla.level]}>{sla.text}</Tag> : <Tag tone="ok">נבדק{r.reviewed_at ? ` ${agoText(r.reviewed_at, p.now)}` : ""}</Tag>}
          <Tag tone={REASON_TONE[r.reason]}>{DM_REASON_LABEL[r.reason]}</Tag>
          <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>דווח {whenText(r.created_at)} · {agoText(r.created_at, p.now)}</span>
        </div>
      </div>
      <Section title="מי ואיפה">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "14px" }}>
          <PersonLine label="מי שדווח/ה עליו/ה" p={r.reported} extra={r.reported && about !== null && about > 0
            ? <div><Link href={`/dm-reports?status=all&person=${r.reported.id}`} prefetch={false} style={{ fontSize: "13.5px", color: "var(--blue)" }} data-dm-others="">
                {about === 1 ? "עוד דיווח אחד עליו/ה" : `עוד ${about} דיווחים עליו/ה`}</Link></div>
            : r.reported && about === 0 ? <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>הדיווח הראשון עליו/ה</div> : null} />
          <PersonLine label="המדווח/ת" p={r.reporter} extra={by !== null && by > 0
            ? <div style={{ fontSize: "13.5px", color: "var(--text-2)" }} data-dm-by="">{by === 1 ? "דיווח/ה פעם אחת נוספת" : `דיווח/ה עוד ${by} פעמים`}</div> : null} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "12.5px", color: "var(--text-2)" }}>הבניין</div>
            {r.building
              ? <Link href={`/buildings/${r.building.id}`} prefetch={false} style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", textDecoration: "none" }} data-dm-building=""><bdi>{r.building.name}</bdi></Link>
              : <span style={{ fontSize: "15px", color: "var(--text-2)" }}>בלי בניין</span>}
          </div>
        </div>
      </Section>

      {r.note && (
        <Section title="מה המדווח/ת כתב/ה">
          <div dir="auto" style={{ fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "12px 14px", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--border)" }} data-dm-note="">{r.note}</div>
        </Section>
      )}

      <Section title="ההודעות שצורפו" hint={`${countsText(r.counts)}. ${VERIFIED_HINT}${r.counts.media ? ` ${MEDIA_HINT}` : ""}`}>
        {r.messages.length === 0
          ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-dm-no-messages="">המדווח/ת לא צירף/ה הודעות. אפשר לבדוק לפי ההערה ולפי דיווחים נוספים.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {r.messages.map((m) => <Bubble key={m.id} m={m} names={names} opened={p.opened} onOpen={p.onOpenMedia} onClose={p.onCloseMedia} />)}
            </div>}
      </Section>

      {p.canManage && (
        <Section title={r.status === "open" ? "סימון כנבדק" : "הדיווח נבדק"} hint={r.status === "open"
          ? "הדיווח יוצא מהתור. ההודעה למדווח/ת אומרת רק שהדיווח נבדק, בלי מה הוחלט; הצד השני לא יודע."
          : `נבדק ${r.reviewed_at ? whenText(r.reviewed_at) : ""}. אם צריך עוד בדיקה, אפשר להחזיר לתור.`}>
          {r.status === "open" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-dm-review="">
              <label style={fieldLabel}>מה נבדק ומה נעשה (לא חובה)
                <textarea style={{ ...textareaStyle, minHeight: "84px" }} value={p.note} maxLength={DM_NOTE_MAX} onChange={(e) => p.onNote(e.target.value)} aria-describedby="dm-note-hint" data-dm-review-note="" />
                <span id="dm-note-hint" style={{ fontSize: "12.5px", color: "var(--text-3)" }}>{NOTE_HINT}</span>
              </label>
              {r.reporter ? (
                <label style={{ display: "flex", gap: "10px", alignItems: "center", minHeight: "44px", fontSize: "14.5px" }}>
                  <input type="checkbox" checked={p.notify} onChange={(e) => p.onNotify(e.target.checked)} style={{ width: "20px", height: "20px" }} data-dm-review-notify="" />
                  לשלוח למדווח/ת הודעה שהדיווח נבדק (פעם אחת לדיווח)
                </label>
              ) : <div style={{ fontSize: "13.5px", color: "var(--text-2)" }} data-dm-no-reporter="">החשבון של המדווח/ת נמחק, אז אין למי לשלוח הודעה.</div>}
              <div><button type="button" style={solidBtn("#15803d")} disabled={p.busy} onClick={p.onReview} data-dm-review-go="">
                <ShieldCheck size={18} aria-hidden="true" /> {p.busy ? "שולחים…" : "נבדק"}
              </button></div>
            </div>
          ) : (
            <>
              {/* מישהו אחר סימן קודם: ההערה שכתבת לא נשמרה — מוצגת כאן, כדי להעתיק או להחזיר לתור ולסמן שוב איתה */}
              {p.note.trim() && (
                <div data-dm-unsaved-note="">
                  <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginBottom: "4px" }}>ההערה שלך, שלא נשמרה:</div>
                  <div dir="auto" style={{ fontSize: "14.5px", lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "10px 12px", borderRadius: "10px", border: "1px dashed var(--border)" }}>{p.note}</div>
                </div>
              )}
              <div><button type="button" style={ghostBtn} disabled={p.busy} onClick={p.onReopen} data-dm-reopen=""><RefreshCw size={16} aria-hidden="true" /> {p.busy ? "שולחים…" : "להחזיר לתור"}</button></div>
            </>
          )}
          {/* מה קרה — ליד הכפתור (בטלפון הדף ארוך, והראש שלו מחוץ למסך); "כבר נבדק" — אזהרה, לא הצלחה */}
          {p.error && <Banner tone="error">{p.error}</Banner>}
          {p.done && <Banner tone={p.done === ALREADY_CHECKED_TEXT ? "warn" : "ok"}>{p.done}</Banner>}
          {r.reported && (
            <div style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
              צריך לפעול מול <bdi>{r.reported.name}</bdi>? <Link href={`/tenants/${r.reported.id}`} prefetch={false} style={{ color: "var(--blue)" }}>בדף שלו/ה</Link> אפשר לחסום או להסיר מהבניין.
            </div>
          )}
        </Section>
      )}

      <Section title="מי פתח ומה נעשה" hint="מהיומן של bloc: כל פתיחה של הדיווח או של קובץ, כל בדיקה וכל החזרה לתור.">
        {p.report.history === null
          ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-dm-history="failed">ההיסטוריה לא נטענה. הדיווח עצמו כן.</div>
          : p.report.history.length === 0
            ? <div style={{ color: "var(--text-2)", fontSize: "14px" }} data-dm-history="empty">אין עדיין רישום.</div>
            : <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }} data-dm-history="list">
                {collapseHistory(p.report.history).map((h, i) => (
                  <li key={`${h.at}:${i}`} style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "14px" }}>
                    {h.action === "viewed" || h.action === "media" ? <Eye size={16} color="var(--text-3)" aria-hidden="true" style={{ marginTop: "3px", flexShrink: 0 }} />
                      : <History size={16} color="var(--text-3)" aria-hidden="true" style={{ marginTop: "3px", flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div dir="rtl"><bdi dir="ltr">{h.by}</bdi> {historyAction(h)} <span style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>· {whenText(h.at)}</span></div>
                      {h.note && <div dir="auto" style={{ color: "var(--text-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>&quot;{h.note}&quot;</div>}
                      {h.redacted && <div style={{ color: "var(--text-2)" }}>ההערה לא נשמרה, כי היא נראתה כמו מפתח או סיסמה.</div>}
                    </div>
                  </li>
                ))}
              </ul>}
      </Section>
    </>
  );
}

/** ההודעה אחרי הצלחה. */
export function reviewDoneText(changed: boolean, notify: boolean, notified: boolean | null, already = false): string {
  if (!changed) return ALREADY_CHECKED_TEXT;
  if (already) return "הדיווח סומן כנבדק. המדווח/ת כבר קיבל/ה הודעה בבדיקה הקודמת, אז לא נשלחה עוד אחת.";
  if (!notify) return "הדיווח סומן כנבדק.";
  return notified ? "הדיווח סומן כנבדק, והמדווח/ת קיבל/ה הודעה." : "הדיווח סומן כנבדק, אבל ההודעה למדווח/ת לא נשלחה.";
}

/** מה שנשלח ב"נבדק": הודעה רק כשביקשו ויש למי (החשבון של המדווח/ת לא נמחק); הערה רק כשכתבו. */
export function reviewBody(report: Pick<DmReport, "id" | "reporter">, note: string, notify: boolean): { action: "review"; id: string; notify: boolean; note?: string } {
  return { action: "review", id: report.id, notify: notify && !!report.reporter, ...(note.trim() ? { note: note.trim() } : {}) };
}

/** ההערה אחרי פעולה: נמחקת רק כשמשהו נשמר; כשלא (מישהו אחר כבר בדק) — נשארת, כדי לא לאבד אותה. */
export const noteAfter = (changed: boolean, note: string): string => (changed ? "" : note);

type ActionAnswer = { ok: true; changed: boolean; notified: boolean | null; already: boolean } | { ok: false; error: string };
async function postAction(body: Record<string, unknown>): Promise<ActionAnswer> {
  try {
    const r = await fetch("/api/dm-reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (r.ok && j?.ok === true && typeof j.changed === "boolean") return { ok: true, changed: j.changed, notified: typeof j.notified === "boolean" ? j.notified : null, already: j.already === true };
    return { ok: false, error: typeof j?.error === "string" ? j.error : "לא ברור אם הפעולה בוצעה. רעננו את הדף." };
  } catch {
    return { ok: false, error: "אין חיבור, ולא ברור אם הפעולה בוצעה. רעננו את הדף." };
  }
}

export type ReportState = { state: "loading" } | { state: "ok"; report: DmReport; now: number } | { state: "not_found" } | { state: "missing" } | { state: "error"; message: string };

/** תשובת /api/dm-reports/one → מצב המסך. צורה לא מוכרת — כשל. */
export function reportFromReply(status: number, j: unknown, now: number): ReportState {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  if (status === 404 || o.state === "not_found") return { state: "not_found" };
  if (o.state === "missing") return { state: "missing" };
  if (status >= 200 && status < 300 && o.state === "ok" && o.report && typeof o.report === "object") return { state: "ok", report: o.report as DmReport, now };
  return { state: "error", message: typeof o.message === "string" ? o.message : typeof o.error === "string" ? o.error : "הקריאה מ-bloc נכשלה. נסו שוב." };
}

/** מה שמוצג כשאין דיווח להציג (טוען / לא נמצא / לא הותקן / נכשל). */
export function ReportStatusView({ s, onRetry }: { s: Exclude<ReportState, { state: "ok" }>; onRetry: () => void }) {
  const back = <Link href="/dm-reports" prefetch={false} style={{ color: "var(--blue)", fontSize: "14.5px", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>כל הדיווחים</Link>;
  if (s.state === "loading") return <>{back}<div style={{ color: "var(--text-2)", fontSize: "14px" }} aria-busy="true" data-dm-report-loading="">טוענים את הדיווח…</div></>;
  if (s.state === "not_found") return <>{back}<Banner tone="warn">הדיווח לא נמצא. ייתכן שעברו 12 חודשים מאז שנשלח והוא נמחק.</Banner></>;
  if (s.state === "missing") return <>{back}<Banner tone="warn">{DM_SQL_MISSING_TEXT}</Banner></>;
  return <>{back}<Banner tone="error" action={<button type="button" style={ghostBtn} onClick={onRetry} data-dm-retry="">נסו שוב</button>}>{s.message}</Banner></>;
}

export default function DmReportView({ id, canManage }: { id: string; canManage: boolean }) {
  const [state, setState] = useState<ReportState>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const urls = useRef<string[]>([]);
  const mounted = useRef(true);
  const aborts = useRef<AbortController[]>([]);
  // ה-blob של קובץ שנפתח — רק בזיכרון; משוחרר כשיוצאים מהדף, וגם הורדה שעוד רצה נעצרת
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const c of aborts.current) c.abort();
      for (const u of urls.current) URL.revokeObjectURL(u);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dm-reports/one", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await r.json().catch(() => null);
      if (mounted.current) setState(reportFromReply(r.status, j, Date.now()));
    } catch {
      if (mounted.current) setState({ state: "error", message: "אין חיבור. נסו שוב." });
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const send = async (body: Record<string, unknown>, ok: (a: { changed: boolean; notified: boolean | null; already: boolean }) => string) => {
    setBusy(true); setError(null); setDone(null);
    const r = await postAction(body);
    setBusy(false);
    if (!r.ok) { setError(r.error); return }
    setDone(ok(r));
    setNote((n) => noteAfter(r.changed, n));
    void load();
  };
  const openMedia = async (mid: string) => {
    setOpened((o) => ({ ...o, [mid]: { state: "loading" } }));
    const c = new AbortController();
    aborts.current.push(c);
    const r = await openReportedMedia(id, mid, { signal: c.signal });
    if (!mounted.current) { if (r.ok) URL.revokeObjectURL(r.url); return }
    if (r.ok) urls.current.push(r.url);
    setOpened((o) => ({ ...o, [mid]: r.ok ? { state: "open", url: r.url, kind: r.kind } : { state: "error", error: r.error } }));
  };
  const closeMedia = (mid: string) => {
    setOpened((o) => {
      const cur = o[mid];
      if (cur?.state === "open") URL.revokeObjectURL(cur.url);
      const next = { ...o };
      delete next[mid];
      return next;
    });
  };
  if (state.state !== "ok") return <ReportStatusView s={state} onRetry={() => { setState({ state: "loading" }); void load(); }} />;
  const report = state.report;
  return (
    <DmReportDetailView report={report} canManage={canManage} now={state.now} busy={busy} error={error} done={done} note={note} notify={notify} opened={opened}
      onNote={setNote} onNotify={setNotify} onOpenMedia={(mid) => { void openMedia(mid) }} onCloseMedia={closeMedia}
      onReview={() => { const b = reviewBody(report, note, notify); void send(b, (a) => reviewDoneText(a.changed, b.notify, a.notified, a.already)) }}
      onReopen={() => { void send({ action: "reopen", id: report.id }, (a) => (a.changed ? "הדיווח חזר לתור." : "הדיווח כבר היה בתור.")) }} />
  );
}
