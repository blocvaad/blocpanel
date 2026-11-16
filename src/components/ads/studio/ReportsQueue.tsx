"use client";
// studio/ReportsQueue — תור הדיווחים (bloc ADS-2ב1, החלטות 386–387, 390): דיווחים של דיירים על פרסומות, לפי קמפיין — המפרסם, שם
// הקמפיין, התמונה של המודעה, כמה דיווחים מכל סיבה, הדיווח האחרון, ההערות (כל אחת עם הסיבה והתאריך — בלי מי, בלי בניין ובלי עיר),
// והמצב ("הושהה אוטומטית בגלל דיווחים" — ראשון, באדום). ההחלטות (387): "בדקנו — תקין" / "להשאיר מושהה" / "להשהות" — כל אחת עם משפט
// אישור שאומר מה יקרה, ונשלחת ל-bloc (reports.review); bloc רושם ביומן. סינון: "חדשים" (ברירת מחדל) / "הכל". נכשל / ריק / חסר SQL —
// מצבים שונים (הטעינה — loading.tsx).
// ReportsQueue — המצב והבקשה; ReportsQueueView / ReportGroupCard / ReportsQueueSkeleton — התצוגה (טהורה).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldAlert, ShieldCheck, ChevronLeft } from "lucide-react";
import { Banner, Tag, solidBtn, ghostBtn } from "@/components/ui/panelKit";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { postAds } from "../adsKit";
import { isOurAdImage } from "@/lib/adsUi";
import { objectPosition, isFormat } from "@/lib/adsFormats";
import { ilWhen } from "@/lib/adsExplain";
import {
  REASON_LABEL, REPORT_STATUS_LABEL, REPORTS_FILTERS, SERIOUS_REASONS, PAUSED_BY_REPORTS_TEXT, REPORTS_EMPTY_ALL_TEXT, REPORTS_EMPTY_NEW_TEXT,
  REPORTS_FAILED_TEXT, REPORTS_PRIVACY_TEXT, REPORTS_SQL_MISSING_TEXT, NOTES_MAX, decisionsFor, filterGroups, needsReview, parseReviewAnswer,
  reviewBody, reviewNotice, seenUntilFor, type ReportGroup, type ReportsFilter, type ReviewDecision,
} from "@/lib/adsReports";
import { AdvertiserAvatar, FormatGlyph, Segmented, StudioNav, STUDIO_CSS, STUDIO_IMAGE_BASE } from "./kit";

const STATE_TAG: Record<ReportGroup["state"], { tone: "danger" | "wait" | "ok" | "muted"; text: string }> = {
  paused_reports: { tone: "danger", text: PAUSED_BY_REPORTS_TEXT },
  paused: { tone: "wait", text: "מושהה" },
  active: { tone: "ok", text: "פעיל" },
  idle: { tone: "muted", text: "לא פעיל" },
};

function Thumb({ g, imageBase }: { g: ReportGroup; imageBase: string | null }) {
  const c = g.creative;
  const ok = c && c.image_url && /^https:\/\//.test(c.image_url) && isOurAdImage(c.image_url, imageBase) !== false;
  return (
    <div style={{ width: "56px", height: "56px", borderRadius: "12px", overflow: "hidden", flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}
      data-report-thumb={ok ? "image" : "none"}>
      {ok
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={c!.image_url} alt={c!.image_alt} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition(c!.focal_x, c!.focal_y) }} />
        : c && isFormat(c.format) ? <FormatGlyph format={c.format} size={22} /> : <ShieldAlert size={20} color="var(--text-3)" aria-hidden="true" />}
    </div>
  );
}

export interface ReportGroupCardProps {
  g: ReportGroup; filter: ReportsFilter; canManage: boolean; imageBase: string | null; busy: boolean; anyBusy: boolean;
  confirming: ReviewDecision | null; onAsk: (d: ReviewDecision) => void; onConfirm: () => void; onCancel: () => void; now?: Date;
}
export function ReportGroupCard({ g, filter, canManage, imageBase, busy, anyBusy, confirming, onAsk, onConfirm, onCancel, now }: ReportGroupCardProps) {
  const tag = STATE_TAG[g.state];
  const red = g.state === "paused_reports";
  const counts = g.byReason.filter((x) => (filter === "new" ? x.open > 0 : x.total > 0));
  const notes = (filter === "new" ? g.notes.filter((n) => n.status === "new") : g.notes);
  const shown = notes.slice(0, NOTES_MAX);
  const options = canManage ? decisionsFor(g) : [];
  const asked = options.find((o) => o.decision === confirming) ?? null;
  const name = g.campaign?.name ?? "קמפיין שנמחק";
  const summary = filter === "new"
    ? `${g.open === 1 ? "דיווח פתוח אחד" : `${g.open} דיווחים פתוחים`}${g.seriousOpen ? ` · ${g.seriousOpen === 1 ? "חמור אחד" : `${g.seriousOpen} חמורים`}` : ""}`
    : `${g.total === 1 ? "דיווח אחד" : `${g.total} דיווחים`}${g.open ? ` · ${g.open === 1 ? "פתוח אחד" : `${g.open} פתוחים`}` : " · כולם נבדקו"}`;
  return (
    <article className="card" data-report-group={g.campaignId} data-report-state={g.state} aria-busy={busy || undefined}
      style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0, ...(red ? { borderColor: "rgba(239,68,68,.6)", background: "rgba(239,68,68,.05)" } : {}) }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
        <Thumb g={g} imageBase={imageBase} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "15.5px", fontWeight: 800, color: "var(--text)", lineHeight: 1.3, overflowWrap: "anywhere" }}>{name}</span>
          {g.campaign && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-2)", minWidth: 0 }}>
              <AdvertiserAvatar name={g.campaign.advertiser || name} logo={g.campaign.advertiser_logo} color={g.campaign.advertiser_color} size={18} imageBase={imageBase} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.campaign.advertiser || "—"}</span>
            </span>
          )}
          <span className="studio-num" style={{ fontSize: "12.5px", color: "var(--text-2)" }} data-report-summary="">{summary} · <span style={{ whiteSpace: "nowrap" }}>אחרון {ilWhen(g.lastAt, now)}</span></span>
        </div>
      </div>
      <span style={{ alignSelf: "flex-start" }} data-report-state-tag={g.state}><Tag tone={tag.tone}>{tag.text}</Tag></span>
      {counts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }} data-report-reasons={counts.map((x) => x.reason).join(",")}>
          {counts.map((x) => {
            const serious = SERIOUS_REASONS.has(x.reason);
            const n = filter === "new" ? x.open : x.total;
            return (
              <span key={x.reason} data-report-reason={x.reason} data-report-reason-count={n}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "99px", fontSize: "13px", fontWeight: 600,
                  border: `1px solid ${serious ? "rgba(239,68,68,.45)" : "var(--border)"}`, background: serious ? "rgba(239,68,68,.1)" : "transparent", color: "var(--text)" }}>
                {REASON_LABEL[x.reason]}<b className="studio-num" style={{ fontFamily: "var(--mono)" }}>{n}</b>
              </span>
            );
          })}
        </div>
      )}
      {shown.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }} data-report-notes={shown.length}>
          {shown.map((n) => (
            <li key={n.id} data-report-note={n.reason} style={{ padding: "8px 10px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
              <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                {REASON_LABEL[n.reason]} · {ilWhen(n.created_at, now)}{n.status !== "new" ? <> · <span data-report-note-status={n.status}>{REPORT_STATUS_LABEL[n.status]}</span></> : null}
              </span>
              <span style={{ fontSize: "14px", color: "var(--text)", lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{n.note}</span>
            </li>
          ))}
          {notes.length > shown.length && <li style={{ fontSize: "12.5px", color: "var(--text-3)" }} data-report-notes-more={notes.length - shown.length}>ועוד {notes.length - shown.length} הערות.</li>}
        </ul>
      )}
      {asked ? (
        <div role="alertdialog" aria-label="אישור ההחלטה" data-report-confirm={asked.decision}
          style={{ padding: "12px", borderRadius: "12px", border: `1px solid ${asked.danger ? "rgba(239,68,68,.5)" : "var(--border-2)"}`, background: asked.danger ? "rgba(239,68,68,.08)" : "var(--surface)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }}>{asked.confirm}</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={onConfirm} disabled={busy} style={solidBtn(asked.danger ? "#dc2626" : "var(--blue)")} data-report-yes="">{busy ? "שומרים…" : `כן, ${asked.label}`}</button>
            <button type="button" onClick={onCancel} disabled={busy} style={ghostBtn} data-report-no="">ביטול</button>
          </div>
        </div>
      ) : options.length > 0 ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} data-report-decisions={options.map((o) => o.decision).join(",")}>
          {options.map((o) => (
            <button key={o.decision} type="button" disabled={anyBusy} onClick={() => onAsk(o.decision)} data-report-decision={o.decision}
              style={o.primary ? { ...solidBtn("var(--blue)"), opacity: anyBusy ? 0.6 : 1 } : { ...ghostBtn, ...(o.danger ? { color: "var(--red)", borderColor: "rgba(239,68,68,.5)" } : {}) }}>
              {o.decision === "dismiss" && <ShieldCheck size={16} aria-hidden="true" />}{o.label}
            </button>
          ))}
        </div>
      ) : null}
      {g.campaign && (
        <Link href={`/ads/campaigns/${g.campaignId}`} style={{ alignSelf: "flex-start", fontSize: "13.5px", color: "var(--blue)", textDecoration: "none", minHeight: "36px", display: "inline-flex", alignItems: "center", gap: "4px" }} data-report-open={g.campaignId}>
          לדף הקמפיין<ChevronLeft size={14} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export function ReportsQueueSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} data-reports-queue="loading" aria-busy="true">
      <SkeletonCard height={56} />
      <SkeletonCard height={44} />
      {[0, 1, 2].map((i) => <SkeletonCard key={i} height={190} />)}
    </div>
  );
}

export interface ReportsQueueViewProps {
  state: "ok" | "missing" | "error"; groups: ReportGroup[]; filter: ReportsFilter; onFilter: (f: ReportsFilter) => void;
  canManage: boolean; imageBase: string | null; truncated?: boolean;
  busy: string | null; confirming: { campaignId: string; decision: ReviewDecision } | null;
  onAsk: (g: ReportGroup, d: ReviewDecision) => void; onConfirm: () => void; onCancel: () => void;
  notice: string | null; err: string | null; unclear: boolean; onRetry: () => void; now?: Date;
}

export function ReportsQueueView(p: ReportsQueueViewProps) {
  const open = p.groups.reduce((s, g) => s + g.open, 0);
  const pending = p.groups.filter(needsReview).length;
  const header = (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <style>{STUDIO_CSS}</style>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>דיווחים</h1>
        <p style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px", lineHeight: 1.6 }}>מה דיירים דיווחו על פרסומות — לפי קמפיין. כל החלטה נשלחת ל-bloc ונרשמת ביומן.</p>
      </div>
      <StudioNav active="reports" reports={p.state === "ok" ? open : null} />
    </div>
  );
  if (p.state !== "ok") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-reports-queue={p.state}>
        {header}
        {p.state === "missing"
          ? <Banner tone="warn"><span data-reports-missing="">{REPORTS_SQL_MISSING_TEXT}</span></Banner>
          : <Banner tone="error" action={<button type="button" style={ghostBtn} onClick={p.onRetry} data-reports-retry=""><RefreshCw size={15} />נסו שוב</button>}>
              <span data-reports-error="">{REPORTS_FAILED_TEXT}</span>
            </Banner>}
      </div>
    );
  }
  const shown = filterGroups(p.groups, p.filter);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }} data-reports-queue="ok">
      {header}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <Segmented<ReportsFilter> label="סינון" testId="reports-filter" value={p.filter} onChange={p.onFilter}
          options={REPORTS_FILTERS.map((f) => ({ key: f.key, label: f.key === "new" ? `${f.label} · ${pending}` : f.label }))} />
        <span style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.5, flex: "1 1 200px" }} data-reports-privacy="">{REPORTS_PRIVACY_TEXT}</span>
      </div>
      {!p.canManage && <Banner tone="info"><span data-reports-readonly="">רק מנהלים יכולים להחליט על דיווחים. כאן — לקריאה.</span></Banner>}
      {p.notice && <Banner tone="ok"><span data-reports-notice="">{p.notice}</span></Banner>}
      {p.err && (
        <Banner tone="error" action={p.unclear ? <button type="button" style={ghostBtn} onClick={p.onRetry} data-reports-recheck="">רענון</button> : undefined}>
          <span data-reports-action-error="">{p.err}</span>
        </Banner>
      )}
      {p.truncated && <span style={{ fontSize: "12.5px", color: "var(--yellow)" }} data-reports-truncated="">יש יותר מ-1,000 דיווחים פתוחים — מוצגים האחרונים.</span>}
      {shown.length === 0 ? (
        <div className="card" style={{ padding: "22px 18px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" }} data-reports-empty={p.filter}>
          <ShieldCheck size={28} color="var(--green)" aria-hidden="true" />
          <p style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)" }}>{p.filter === "new" ? REPORTS_EMPTY_NEW_TEXT : REPORTS_EMPTY_ALL_TEXT}</p>
          <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
            דיירים מדווחים מתוך &quot;למה אני רואה את הפרסומת הזו?&quot; באפליקציה. קמפיין שמגיע למספר הדיווחים החמורים שבהגדרות (מדיווחים שעוד לא נבדקו) מושהה מעצמו ומופיע כאן ראשון.
          </p>
          {p.filter === "new" && p.groups.length > 0 && (
            <button type="button" style={ghostBtn} onClick={() => p.onFilter("all")} data-reports-show-all="">לכל הדיווחים ({p.groups.length === 1 ? "קמפיין אחד" : `${p.groups.length} קמפיינים`})</button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(320px,100%),1fr))", gap: "10px" }} data-reports-groups={shown.length}>
          {shown.map((g) => (
            <ReportGroupCard key={g.campaignId} g={g} filter={p.filter} canManage={p.canManage} imageBase={p.imageBase} now={p.now}
              busy={p.busy === g.campaignId} anyBusy={!!p.busy} confirming={p.confirming?.campaignId === g.campaignId ? p.confirming.decision : null}
              onAsk={(d) => p.onAsk(g, d)} onConfirm={p.onConfirm} onCancel={p.onCancel} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportsQueue({ state, groups, canManage, initialFilter = "new", truncated = false, imageBase }: {
  state: "ok" | "missing" | "error"; groups: ReportGroup[]; canManage: boolean; initialFilter?: ReportsFilter; truncated?: boolean; imageBase?: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReportsFilter>(initialFilter);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ campaignId: string; decision: ReviewDecision } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [unclear, setUnclear] = useState(false);

  async function decide() {
    const c = confirming;
    if (!c || busy) return;
    const g = groups.find((x) => x.campaignId === c.campaignId);
    if (!g) return;
    setBusy(c.campaignId); setErr(null); setNotice(null); setUnclear(false);
    // סקירה #10: רק מה שהוצג נסגר — seen_until לפי הסינון שעל המסך
    const r = await postAds(reviewBody(c.campaignId, c.decision, seenUntilFor(g, filter)));
    setBusy(null); setConfirming(null);
    if (!r.ok) { setErr(r.error); setUnclear(r.unclear); return; }
    setNotice(`"${g.campaign?.name ?? "הקמפיין"}": ${reviewNotice(c.decision, g.state === "paused_reports", parseReviewAnswer(r.data))}`);
    router.refresh();
  }
  return (
    <ReportsQueueView state={state} groups={groups} filter={filter} canManage={canManage} imageBase={imageBase === undefined ? STUDIO_IMAGE_BASE : imageBase} truncated={truncated}
      onFilter={(f) => { setFilter(f); setConfirming(null); window.history.replaceState(null, "", f === "new" ? "/ads/reports" : "/ads/reports?filter=all"); }}
      busy={busy} confirming={confirming} onAsk={(g, d) => { setConfirming({ campaignId: g.campaignId, decision: d }); setNotice(null); setErr(null); }}
      onConfirm={() => void decide()} onCancel={() => setConfirming(null)}
      notice={notice} err={err} unclear={unclear} onRetry={() => { setErr(null); setUnclear(false); router.refresh(); }} />
  );
}
