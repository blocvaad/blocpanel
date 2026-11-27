"use client";
// מרכז התפעול — bloc OPS-1 (שלב 9, החלטות 752–755). מה תקין ומה לא, במסך אחד:
//   • השורה העליונה: הכל תקין / כמה לא תקינים וכמה לבדוק, ומתי נבדק. רענון כל דקה.
//   • "דורש תשומת לב": כל פריט עם מה קרה, ספר ההפעלה שלו, ו"פתיחת תקלה" (admin וסופר-אדמין) — עם החומרה של הספר.
//   • המשימות המתוזמנות (מתי הצליחה, 7 הימים האחרונים, השגיאה), הגיבוי ותרגול השחזור (ורישום תרגול), התורים של הצוות,
//     יומן התקלות (ציר זמן, עדכון, "במעקב", סגירה עם סיכום) וכל ספרי ההפעלה.
// חלק שלא נטען — "לא נטען", אף פעם "תקין" או 0.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BookOpen, CheckCircle2, Clock, DatabaseBackup, ListChecks, RefreshCw, ShieldAlert, X } from "lucide-react";
import {
  agoLabel, bytesLabel, LEVEL_COLOR, LEVEL_LABEL, METHOD_LABEL, RESULT_LABEL, STATUS_LABEL, yesterdayIL,
  type Incident, type IncidentUpdate, type OpsItem, type OpsLevel, type OpsResponse,
} from "@/lib/ops";
import { playbook, PLAYBOOKS, SEVERITY_LABEL, type Playbook, type Severity } from "@/lib/playbooks";

const REFRESH_MS = 60_000;

function Dot({ level }: { level: OpsLevel }) {
  return <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: LEVEL_COLOR[level], flexShrink: 0, display: "inline-block" }} />;
}

function LevelBadge({ level }: { level: OpsLevel }) {
  const cls = level === "ok" ? "badge-green" : level === "warn" ? "badge-yellow" : level === "down" ? "badge-red" : "badge-muted";
  return <span className={`badge ${cls}`} data-ops-level={level}>{LEVEL_LABEL[level]}</span>;
}

function Section({ id, icon: Icon, title, children, action }: { id: string; icon: typeof Activity; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section id={id} className="card" style={{ padding: 18 }} data-ops-section={id}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}><Icon size={16} />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type Sheet =
  | { kind: "playbook"; key: string }
  | { kind: "open"; title: string; severity: Severity; playbook: string | null; source: string | null }
  | { kind: "update"; incident: Incident }
  | { kind: "resolve"; incident: Incident }
  | { kind: "drill" }
  | null;

export default function OpsBoard() {
  const [data, setData] = useState<OpsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ops", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setLoadError((j && j.error) || "מרכז התפעול לא נטען"); }
      else { setData(j as OpsResponse); setLoadError(null); }
    } catch { setLoadError("שגיאת רשת — מרכז התפעול לא נטען"); }
    setLoading(false);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <OpsBoardView data={data} loadError={loadError} loading={loading} now={now} onRefresh={load} onSheet={setSheet} />
      {sheet && <OpsSheet sheet={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} canManage={!!data?.canManage}
        onOpenFromPlaybook={(p) => setSheet({ kind: "open", title: p.title, severity: p.severity, playbook: p.key, source: null })} />}
    </>
  );
}

export type OpsBoardViewProps = {
  data: OpsResponse | null; loadError: string | null; loading: boolean; now: number; onRefresh: () => void; onSheet: (s: Sheet) => void;
};

/** המסך עצמו — pure (הבדיקות מציירות אותו בשרת עם הצורה שה-route מחזיר). */
export function OpsBoardView({ data, loadError, loading, now, onRefresh, onSheet }: OpsBoardViewProps) {
  const setSheet = onSheet;
  const load = onRefresh;
  const snap = data?.snapshot ?? null;
  const updatesOf = new Map<string, IncidentUpdate[]>();
  for (const u of data?.updates ?? []) updatesOf.set(u.incident_id, [...(updatesOf.get(u.incident_id) ?? []), u]);
  const openIncidents = (data?.incidents ?? []).filter((i) => i.status !== "resolved");
  // פריט שכבר יש עליו תקלה פתוחה (אותו מקור) — קישור לתקלה, לא "פתיחת תקלה" נוספת (השרת היה מסרב: 409)
  const openBySource = new Map(openIncidents.filter((i) => i.source).map((i) => [i.source as string, i] as const));
  const closedIncidents = (data?.incidents ?? []).filter((i) => i.status === "resolved").slice(0, 8);
  const canManage = !!data?.canManage;

  function openFromItem(item: OpsItem) {
    const pb = playbook(item.playbook);
    setSheet({ kind: "open", title: `${item.title}: ${item.detail}`.slice(0, 140), severity: pb?.severity ?? (item.level === "down" ? "p1" : "p2"), playbook: item.playbook, source: item.key });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-ops-board="">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.03em" }}>מרכז התפעול</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>המשימות המתוזמנות, הגיבוי והשחזור, התורים של הצוות, התקלות וספרי ההפעלה — מתעדכן כל דקה.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading} data-ops-refresh="">
          <RefreshCw size={14} />{loading ? "בודק…" : "בדיקה עכשיו"}
        </button>
      </div>

      {loadError && !data && (
        <div role="alert" className="card" style={{ padding: "12px 16px", color: "var(--red)", borderColor: "#ef444440" }} data-ops-load-error="">{loadError}</div>
      )}

      {data && (
        <div className="card" style={{ padding: "16px 18px", borderInlineStart: `4px solid ${LEVEL_COLOR[snap?.overall ?? "unknown"]}` }} data-ops-overall={snap?.overall ?? "unknown"}>
          {snap ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {snap.overall === "ok" ? <CheckCircle2 size={22} color="var(--green)" /> : <AlertTriangle size={22} color={LEVEL_COLOR[snap.overall]} />}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {snap.overall === "ok" ? "הכל תקין"
                    : [snap.counts.down ? `${snap.counts.down} לא תקינים` : null, snap.counts.warn ? `${snap.counts.warn} לבדוק` : null, snap.counts.unknown ? `${snap.counts.unknown} לא נטענו` : null].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>נבדק {agoLabel(snap.generated_at, now)}</div>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--red)", fontSize: 14 }} data-ops-snapshot-error="">מצב התפעול לא נטען מ-bloc{data.snapshotError ? ` — ${data.snapshotError}` : ""}</div>
          )}
        </div>
      )}

      {snap && snap.items.length > 0 && (
        <Section id="attention" icon={ShieldAlert} title="דורש תשומת לב">
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none" }}>
            {snap.items.map((it) => (
              <li key={it.key} className="card-sm" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-ops-item={it.key}>
                <Dot level={it.level} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{it.title}</div>
                  {/* the time: for a job — its last success (bloc sends none when the detail already says how long) */}
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>{it.detail}{it.at ? ` · ${it.area === "jobs" ? "הצליחה לאחרונה " : ""}${agoLabel(it.at, now)}` : ""}</div>
                </div>
                <LevelBadge level={it.level} />
                {it.playbook && (
                  <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => setSheet({ kind: "playbook", key: it.playbook! })} data-ops-item-playbook={it.playbook}>
                    <BookOpen size={13} />ספר הפעלה
                  </button>
                )}
                {openBySource.has(it.key) ? (
                  <a href={`#incident-${openBySource.get(it.key)!.id}`} className="btn btn-ghost" style={{ padding: "5px 10px" }} data-ops-item-incident={openBySource.get(it.key)!.id}>
                    {`תקלה ${STATUS_LABEL[openBySource.get(it.key)!.status]}`}
                  </a>
                ) : canManage && (
                  <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => openFromItem(it)} data-ops-item-open={it.key}>פתיחת תקלה</button>
                )}
                {it.href && it.href !== "/ops" && <Link href={it.href} className="btn btn-ghost" style={{ padding: "5px 10px" }}>למסך</Link>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
        <Section id="jobs" icon={Clock} title="משימות מתוזמנות">
          {!snap ? <p style={{ color: "var(--text-3)", fontSize: 13 }}>לא נטען</p> : (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {snap.jobs.map((j) => (
                <li key={j.job} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }} data-ops-job={j.job}>
                  <Dot level={j.level} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{j.label}{j.critical ? <span style={{ color: "var(--text-3)", fontWeight: 400 }}> · קריטית</span> : null}</div>
                    <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {j.last_success ? `הצליחה ${agoLabel(j.last_success, now)}` : "עוד לא הצליחה"}
                      {j.week ? ` · 7 ימים: ${j.week.ok} ✓${j.week.failed ? ` ${j.week.failed} ✗` : ""}` : ""}
                      {j.last_error && j.last_failure && (!j.last_success || j.last_failure > j.last_success) ? ` · ${j.last_error}` : ""}
                    </div>
                  </div>
                  <LevelBadge level={j.level} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="backup" icon={DatabaseBackup} title="גיבוי ושחזור"
          action={canManage ? <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => setSheet({ kind: "drill" })} data-ops-drill-new="">רישום תרגול שחזור</button> : undefined}>
          {!snap ? <p style={{ color: "var(--text-3)", fontSize: 13 }}>לא נטען</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }} data-ops-backup={snap.backup.level}>
                <Dot level={snap.backup.level} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {!snap.backup.configured ? "הגיבוי לא מוגדר" : snap.backup.last_success ? `הגיבוי האחרון הצליח ${agoLabel(snap.backup.last_success, now)}` : "עוד אין גיבוי שהצליח"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[["טבלאות", snap.backup.tables?.toLocaleString("he-IL") ?? "—"], ["שורות", snap.backup.rows?.toLocaleString("he-IL") ?? "—"], ["גודל", bytesLabel(snap.backup.bytes)]].map(([k, v]) => (
                  <div key={k} className="card-sm" style={{ padding: "8px 10px" }}><div style={{ fontSize: 11, color: "var(--text-3)" }}>{k}</div><div style={{ fontSize: 15, fontWeight: 700 }}>{v}</div></div>
                ))}
              </div>
              {snap.backup.week && <div style={{ fontSize: 12, color: "var(--text-2)" }}>7 הלילות האחרונים: {snap.backup.week.ok} הצליחו{snap.backup.week.failed ? `, ${snap.backup.week.failed} נכשלו` : ""}</div>}
              {snap.backup.failed_tables.length > 0 && <div style={{ fontSize: 12, color: "var(--red)" }} data-ops-backup-failed="">נכשלו: {snap.backup.failed_tables.join(", ")}</div>}
              <div className="card-sm" style={{ padding: "10px 12px" }} data-ops-drill-last={snap.backup.drill ? snap.backup.drill.result : "none"}>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>תרגול השחזור האחרון</div>
                {snap.backup.drill
                  ? <div style={{ fontSize: 13 }}>{RESULT_LABEL[snap.backup.drill.result as keyof typeof RESULT_LABEL] ?? snap.backup.drill.result} · מגיבוי {snap.backup.drill.backup_date} · {agoLabel(snap.backup.drill.done_at, now)}</div>
                  : <div style={{ fontSize: 13 }}>עוד לא נעשה. <button type="button" onClick={() => setSheet({ kind: "playbook", key: "restore-drill" })} style={{ background: "none", border: "none", color: "var(--blue)", padding: 0 }}>איך עושים</button></div>}
              </div>
              {data?.drills === null && <div style={{ fontSize: 12, color: "var(--red)" }}>רשימת התרגולים לא נטענה</div>}
              {(data?.drills ?? []).length > 1 && (
                <details><summary style={{ fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>תרגולים קודמים</summary>
                  <ul style={{ listStyle: "none", marginTop: 6 }}>{(data?.drills ?? []).slice(1).map((d) => (
                    <li key={d.id} style={{ fontSize: 12, color: "var(--text-2)", padding: "3px 0" }}>{d.backup_date} · {METHOD_LABEL[d.method]} · {RESULT_LABEL[d.result]}{typeof d.mismatches === "number" ? ` · ${d.mismatches} לא תאמו` : ""}</li>
                  ))}</ul>
                </details>
              )}
            </div>
          )}
        </Section>

        <Section id="queues" icon={ListChecks} title="התורים של הצוות">
          {!snap ? <p style={{ color: "var(--text-3)", fontSize: 13 }}>לא נטען</p> : (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {snap.queues.map((q) => (
                <li key={q.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)" }} data-ops-queue={q.key}>
                  <Dot level={q.level} />
                  <Link href={q.href} style={{ flex: 1, fontSize: 13 }}>{q.title}</Link>
                  <span style={{ fontSize: 12, color: "var(--text-2)" }}>{q.count === null ? "לא נטען" : q.count === 0 ? "ריק" : `${q.count}${q.oldest ? ` · הראשון ${agoLabel(q.oldest, now)}` : ""}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="incidents" icon={AlertTriangle} title="יומן התקלות"
          action={canManage ? <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => setSheet({ kind: "open", title: "", severity: "p2", playbook: null, source: null })} data-ops-incident-new="">תקלה חדשה</button> : undefined}>
          {data?.incidents === null ? <p style={{ color: "var(--red)", fontSize: 13 }} data-ops-incidents-failed="">היומן לא נטען</p>
            : openIncidents.length === 0 ? <p style={{ color: "var(--text-3)", fontSize: 13 }} data-ops-incidents-empty="">אין תקלות פתוחות.</p>
            : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {openIncidents.map((inc) => (
                  <li key={inc.id} id={`incident-${inc.id}`} className="card-sm" style={{ padding: "10px 12px", scrollMarginTop: 80 }} data-ops-incident={inc.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className={`badge ${inc.severity === "p0" || inc.severity === "p1" ? "badge-red" : "badge-yellow"}`}>{inc.severity.toUpperCase()}</span>
                      <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{inc.title}</span>
                      <span className="badge badge-muted">{STATUS_LABEL[inc.status]}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>נפתחה {agoLabel(inc.opened_at, now)} · {inc.opened_by_email}</div>
                    {inc.summary && <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 6 }}>{inc.summary}</p>}
                    <ol style={{ listStyle: "none", marginTop: 8, borderInlineStart: "2px solid var(--border)", paddingInlineStart: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {(updatesOf.get(inc.id) ?? []).map((u) => (
                        <li key={u.id} style={{ fontSize: 12 }} data-ops-update="">
                          <span style={{ color: "var(--text-3)" }}>{agoLabel(u.at, now)} · {u.by_email}{u.status ? ` · ${STATUS_LABEL[u.status as Incident["status"]] ?? u.status}` : ""}</span>
                          <div style={{ color: "var(--text-2)" }}>{u.note}</div>
                        </li>
                      ))}
                    </ol>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {inc.playbook && <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => setSheet({ kind: "playbook", key: inc.playbook! })}><BookOpen size={13} />ספר הפעלה</button>}
                      {canManage && <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => setSheet({ kind: "update", incident: inc })} data-ops-incident-update={inc.id}>עדכון</button>}
                      {canManage && <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px" }} onClick={() => setSheet({ kind: "resolve", incident: inc })} data-ops-incident-resolve={inc.id}>סגירה</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          {closedIncidents.length > 0 && (
            <details style={{ marginTop: 10 }}><summary style={{ fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>נסגרו לאחרונה ({closedIncidents.length})</summary>
              <ul style={{ listStyle: "none", marginTop: 6 }}>{closedIncidents.map((inc) => (
                <li key={inc.id} style={{ fontSize: 12, color: "var(--text-2)", padding: "4px 0" }} data-ops-incident-closed={inc.id}>{inc.severity.toUpperCase()} · {inc.title} · נסגרה {agoLabel(inc.resolved_at, now)}{inc.summary ? ` — ${inc.summary}` : ""}</li>
              ))}</ul>
            </details>
          )}
        </Section>
      </div>

      <Section id="playbooks" icon={BookOpen} title="ספרי הפעלה">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 8 }}>
          {PLAYBOOKS.map((p) => (
            <button key={p.key} type="button" className="card-sm" onClick={() => setSheet({ kind: "playbook", key: p.key })}
              style={{ padding: "10px 12px", textAlign: "start", color: "var(--text)", display: "flex", flexDirection: "column", gap: 4 }} data-ops-playbook={p.key}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{SEVERITY_LABEL[p.severity]}</span>
            </button>
          ))}
        </div>
      </Section>

    </div>
  );
}

function PlaybookView({ p }: { p: Playbook }) {
  const list = (title: string, rows: string[]) => rows.length ? (
    <div style={{ marginTop: 12 }}><div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>{title}</div>
      <ol style={{ paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 4 }}>{rows.map((r, i) => <li key={i} style={{ fontSize: 13 }}>{r}</li>)}</ol></div>
  ) : null;
  return (
    <div data-ops-playbook-view={p.key}>
      <span className="badge badge-muted">{SEVERITY_LABEL[p.severity]}</span>
      <p style={{ fontSize: 13, marginTop: 10 }}><b>מתי:</b> {p.when}</p>
      <p style={{ fontSize: 13, marginTop: 6 }}><b>מה נפגע:</b> {p.impact}</p>
      {list("הדקות הראשונות", p.first)}
      {list("הטיפול", p.steps)}
      {list("איך יודעים שנפתר", p.verify)}
      <p style={{ fontSize: 13, marginTop: 12 }}><b>מי צריך לדעת:</b> {p.notify}</p>
      {p.links.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>{p.links.map((l) => <Link key={l.href} href={l.href} className="btn btn-ghost" style={{ padding: "5px 10px" }}>{l.label}</Link>)}</div>}
    </div>
  );
}

export function OpsSheet({ sheet, onClose, onDone, canManage, onOpenFromPlaybook }: {
  sheet: NonNullable<Sheet>; onClose: () => void; onDone: () => void; canManage: boolean; onOpenFromPlaybook: (p: Playbook) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>((): Record<string, string> => {
    if (sheet.kind === "open") return { title: sheet.title, severity: sheet.severity, summary: "" };
    if (sheet.kind === "drill") {
      // the backup of last night: yesterday on the Israel calendar (a calendar day, not now minus 24 hours)
      return { backup_date: yesterdayIL(), method: "verify", result: "passed", tables_checked: "", rows_checked: "", mismatches: "0", notes: "" };
    }
    if (sheet.kind === "update") return { note: "", status: sheet.incident.status === "resolved" ? "open" : sheet.incident.status };
    if (sheet.kind === "resolve") return { summary: "" };
    return {};
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setError(null); };
  const int = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);

  async function submit() {
    let body: Record<string, unknown>;
    if (sheet.kind === "open") body = { action: "open", title: f.title, severity: f.severity, playbook: sheet.playbook, source: sheet.source, summary: f.summary || null };
    else if (sheet.kind === "update") body = { action: "update", id: sheet.incident.id, note: f.note, status: f.status };
    else if (sheet.kind === "resolve") body = { action: "resolve", id: sheet.incident.id, summary: f.summary };
    else if (sheet.kind === "drill") body = { action: "drill", backup_date: f.backup_date, method: f.method, result: f.result, tables_checked: int(f.tables_checked), rows_checked: int(f.rows_checked), mismatches: int(f.mismatches), notes: f.notes || null };
    else return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/ops", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "לא נשמר. נסו שוב."); setBusy(false); return; }
      onDone();
    } catch { setError("שגיאת רשת — לא נשמר"); setBusy(false); }
  }

  const pb = sheet.kind === "playbook" ? playbook(sheet.key) : null;
  const title = sheet.kind === "playbook" ? (pb?.title ?? "ספר הפעלה") : sheet.kind === "open" ? "תקלה חדשה" : sheet.kind === "update" ? "עדכון בתקלה"
    : sheet.kind === "resolve" ? "סגירת התקלה" : "רישום תרגול שחזור";
  const label = (t: string) => <label style={{ fontSize: 12, color: "var(--text-3)", display: "block", marginTop: 10, marginBottom: 4 }}>{t}</label>;

  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} data-ops-sheet={sheet.kind}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "88dvh", overflowY: "auto", padding: 18, borderRadius: "16px 16px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="סגירה" style={{ background: "none", border: "none", color: "var(--text-2)" }}><X size={18} /></button>
        </div>
        {sheet.kind === "playbook" && (pb ? <>
          <PlaybookView p={pb} />
          {canManage && <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onOpenFromPlaybook(pb)} data-ops-playbook-open="">פתיחת תקלה לפי הספר</button>}
        </> : <p style={{ fontSize: 13 }}>הספר לא נמצא.</p>)}

        {sheet.kind === "open" && <>
          {sheet.playbook && <p style={{ fontSize: 12, color: "var(--text-3)" }}>ספר הפעלה: {playbook(sheet.playbook)?.title ?? sheet.playbook}</p>}
          {label("מה קרה")}<input className="input" value={f.title} onChange={set("title")} maxLength={140} data-ops-form-title="" />
          {label("חומרה")}<select className="input" value={f.severity} onChange={set("severity")} data-ops-form-severity="">
            {(["p0", "p1", "p2", "p3"] as const).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
          </select>
          {label("פירוט (לא חובה, בלי פרטים של דיירים)")}<textarea className="input" style={{ height: 90, padding: 10 }} value={f.summary} onChange={set("summary")} maxLength={2000} />
        </>}

        {sheet.kind === "update" && <>
          <p style={{ fontSize: 13 }}>{sheet.incident.title}</p>
          {label("מה קרה / מה נעשה")}<textarea className="input" style={{ height: 90, padding: 10 }} value={f.note} onChange={set("note")} maxLength={2000} data-ops-form-note="" />
          {label("מצב")}<select className="input" value={f.status} onChange={set("status")}>
            <option value="open">פתוחה</option><option value="monitoring">במעקב</option>
          </select>
        </>}

        {sheet.kind === "resolve" && <>
          <p style={{ fontSize: 13 }}>{sheet.incident.title}</p>
          {label("סיכום: מה קרה, מה נעשה, ומה מונע שזה יחזור")}<textarea className="input" style={{ height: 110, padding: 10 }} value={f.summary} onChange={set("summary")} maxLength={2000} data-ops-form-summary="" />
        </>}

        {sheet.kind === "drill" && <>
          <p style={{ fontSize: 12, color: "var(--text-3)" }}>הבדיקה: node scripts/restore.mjs backups/&lt;תאריך&gt; --verify (בלי כתיבה). שחזור מלא — רק לפרויקט זמני, לפי docs/RESTORE_VERIFY.md.</p>
          {label("התאריך של הגיבוי")}<input className="input" type="date" dir="ltr" value={f.backup_date} onChange={set("backup_date")} data-ops-form-date="" />
          {label("איך")}<select className="input" value={f.method} onChange={set("method")}>
            <option value="verify">{METHOD_LABEL.verify}</option><option value="restore">{METHOD_LABEL.restore}</option>
          </select>
          {label("התוצאה")}<select className="input" value={f.result} onChange={set("result")} data-ops-form-result="">
            <option value="passed">{RESULT_LABEL.passed}</option><option value="partial">{RESULT_LABEL.partial}</option><option value="failed">{RESULT_LABEL.failed}</option>
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <div>{label("טבלאות")}<input className="input" inputMode="numeric" dir="ltr" value={f.tables_checked} onChange={set("tables_checked")} /></div>
            <div>{label("שורות")}<input className="input" inputMode="numeric" dir="ltr" value={f.rows_checked} onChange={set("rows_checked")} /></div>
            <div>{label("לא תאמו")}<input className="input" inputMode="numeric" dir="ltr" value={f.mismatches} onChange={set("mismatches")} /></div>
          </div>
          {label("הערות (לא חובה)")}<textarea className="input" style={{ height: 70, padding: 10 }} value={f.notes} onChange={set("notes")} maxLength={2000} />
        </>}

        {error && <p role="alert" style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }} data-ops-form-error="">{error}</p>}
        {sheet.kind !== "playbook" && (
          <button type="button" className="btn btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} disabled={busy} onClick={submit} data-ops-form-submit="">
            {busy ? "שומר…" : sheet.kind === "resolve" ? "סגירת התקלה" : "שמירה"}
          </button>
        )}
      </div>
    </div>
  );
}
