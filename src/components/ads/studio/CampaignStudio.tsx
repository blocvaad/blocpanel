"use client";
// studio/CampaignStudio — דף קמפיין בסטודיו (bloc ADS-2א v2, החלטה 383). ראש: שם, מפרסם, מצב, איפה מוצג, ופעולות (השהיה / המשך /
// סיום / שכפול / מחיקה כשלא הוצג). לשוניות (?tab=):
//   ביצועים — מדדים (הוגשו / נצפו / הקלקות / CTR / אנשים שונים, עם ההערה כשנשמרו לפני מחיקה), גרף יומי (SVG), כל מודעה עם הפורמט,
//     התמונה בחיתוך שלה, חשיפות, הקלקות ו-CTR, ו"הכי טובה" (ה-CTR הגבוה כשלכל מודעה לפחות 500 חשיפות), לפי פורמט, CSV והדפסה.
//   מודעות — הכרטיסים, "+ מודעה" (הסטודיו בגיליון), עריכה עד ההצגה הראשונה, אחריה — שכפול כמודעה חדשה.
//   קהל ותזמון — עריכה עם שמירה; מה שנעול — מוסבר. למה לא מוצג? — בדיקת משתמש לכל מקום שהקמפיין מכסה. היסטוריה — היומן של הפאנל.
// PANEL-PAY א2ב: הכל דרך bloc. תשובה לא ברורה לשכפול — אין שכפול שני (רק רענון); הצלחה — רק ok === true.
// ADS-2ב1 (החלטות 387–390): "הושהה בגלל דיווחים" בראש הדף (ומה עושים — בתור הדיווחים); בביצועים — "העתקות קוד" (בסה"כ, לכל מודעה
// ולפי פורמט, כשיש קוד) ו"דיווחים: 2 פתוחים"; ב"למה לא מוצג?" — כשבכל המודעות הפעילות המבצע הסתיים, זה מה שנאמר.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Pause, Play, Square, Copy, Trash2, Download, Printer, ShieldAlert } from "lucide-react";
import { Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, Field } from "../adsKit";
import { duplicateHref, lockedAfter, isOurAdImage } from "@/lib/adsUi";
import {
  PRICING_LABEL, fmtInt, fmtCtr, fmtIls, fmtRange, liveNow, reachFrozenText, REACH_UPPER_BOUND_TEXT, SCREEN_LABEL, audienceSummary, contractValue, AD_LOCKED_TEXT,
  COPIES_LABEL, OFFER_ENDED_LIVE_TEXT, showCopies, type AdReport, type Tone,
} from "@/lib/ads";
import { PAUSED_BY_REPORTS_SHORT, PAUSED_BY_REPORTS_TEXT, pausedByReports, reportsSummaryText } from "@/lib/adsReports";
import { BANNER_POSITION_LABEL, FORMAT_INFO, THEME_LABEL, VIEW_DEFINITION, formatText, objectPosition, type AdFormat } from "@/lib/adsFormats";
import { CAMPAIGN_TABS, bestAd, byFormat, campaignPayload, formFromCampaign, formProblem, BEST_MIN_VIEWS, type CampaignForm, type CampaignTab } from "@/lib/adsStudio";
import { ilWhen } from "@/lib/adsExplain";
import { clickKindOf, clicksText, clicksTitle } from "@/lib/adsCta";
import { AUDIT_LABELS } from "@/lib/auditLabels";
import type { AdAdvertiserRow, AdBuildingOption, AdCampaignRow, AdCreativeRow, AdHistoryRow, CampaignPageData } from "@/lib/adsServer";
import { AdvertiserAvatar, KpiTile, PlacementIcons, ScrollTabs, STUDIO_CSS, STUDIO_IMAGE_BASE, FormatGlyph } from "./kit";
import CreativeList from "./CreativeList";
import AudienceEditor, { useReach } from "./AudienceEditor";
import ScheduleEditorView from "./ScheduleEditor";
import ExplainBox from "./ExplainBox";

const dayLabel = (k: string) => `${Number(k.slice(8, 10))}.${Number(k.slice(5, 7))}`;

/** גרף עמודות יומי (SVG): הישן מימין, היום משמאל — כמו שאר הגרפים בפאנל. */
export function DailyChart({ days, w = 600, h = 140 }: { days: AdReport["days"]; w?: number; h?: number }) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.views));
  const n = days.length;
  const gap = n > 40 ? 1 : 3;
  const bw = Math.max(2, (w - gap * (n - 1)) / n);
  const total = days.reduce((s, d) => s + d.views, 0);
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: "4px" }} data-daily-chart={n}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img"
        aria-label={`חשיפות לפי יום: ${n} ימים, ${fmtInt(total)} בסך הכל, הכי הרבה ביום אחד ${fmtInt(max)}`}>
        <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--border)" />
        {days.map((d, i) => {
          const bh = Math.round((d.views / max) * (h - 8));
          const x = w - (i + 1) * bw - i * gap;
          return <rect key={d.day} x={x} y={h - bh} width={bw} height={Math.max(bh, d.views ? 2 : 0)} rx={Math.min(3, bw / 3)} fill="var(--blue)" data-bar={d.day}><title>{`${dayLabel(d.day)}: ${fmtInt(d.views)} חשיפות`}</title></rect>;
        })}
      </svg>
      <figcaption className="studio-num" style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
        <span>{dayLabel(days[0].day)}</span><span>שיא {fmtInt(max)}</span><span>{dayLabel(days[n - 1].day)}</span>
      </figcaption>
    </figure>
  );
}

/** ADS-2ב1: "המשך" על קמפיין שהושהה בגלל דיווחים — שואלים קודם: הדרך הנכונה היא החלטה בתור (היא גם סוגרת את הדיווחים). */
export const RESUME_REPORTED_CONFIRM = "הקמפיין הושהה אוטומטית בגלל דיווחים. להחזיר אותו לפעול בלי להחליט על הדיווחים? (בתור הדיווחים, \"בדקנו — תקין\" גם מחזיר אותו לפעול וגם סוגר את הדיווחים.)";

/** ADS-2ב1: "הושהה אוטומטית בגלל דיווחים ב-<מתי>" — ומה עושים: ההחלטה בתור הדיווחים. */
export function ReportsPausedBanner({ at, now }: { at: string; now?: Date }) {
  return (
    <Banner tone="error" action={<Link href="/ads/reports" style={{ ...ghostBtn, textDecoration: "none" }} data-campaign-reports-link="">לתור הדיווחים</Link>}>
      <span data-campaign-reports-paused="">{PAUSED_BY_REPORTS_TEXT} ({ilWhen(at, now)}). &quot;בדקנו — תקין&quot; בתור הדיווחים מחזיר אותו לפעול וסוגר את הדיווחים.</span>
    </Banner>
  );
}

export function PerformanceTabView({ campaign, report, creatives, imageBase }: { campaign: AdCampaignRow; report: AdReport; creatives: AdCreativeRow[]; imageBase: string | null }) {
  const t = report.totals;
  const byId = new Map(creatives.map((c) => [c.id, c]));
  const formatOf = (id: string): AdFormat | undefined => report.creatives.find((r) => r.creative_id === id)?.format ?? byId.get(id)?.format;
  const best = bestAd(report.creatives);
  const fmts = byFormat(report.creatives, formatOf);
  const slots = [...new Set(campaign.slots)];
  // ADS-2ב1: "העתקות קוד" — רק כשיש בקמפיין מודעה עם קוד (או שכבר הועתק); הדיווחים — מספרים בלבד, בלי מי
  const copies = showCopies(report, creatives.some((c) => !!c.coupon_code));
  const reps = report.reports;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-campaign-tab="performance">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: "8px" }} data-report-totals="">
        <KpiTile testId="serves" label="הוגשו" value={fmtInt(t.serves)} />
        <KpiTile testId="views" label="נצפו" value={fmtInt(t.views)} sub={t.serves ? `${Math.round((Math.min(t.views, t.serves) / t.serves) * 100)}% מההגשות` : null} />
        <KpiTile testId="clicks" label={clicksTitle(creatives.map(clickKindOf))} value={fmtInt(t.clicks)} />
        <KpiTile testId="ctr" label="CTR" value={fmtCtr(t.views, t.clicks)} />
        <KpiTile testId="reach" label="אנשים שונים" value={fmtInt(t.reach)} prefix={report.reachUpperBound ? "עד" : null}
          sub={report.reachUpperBound ? "לכל היותר" : report.reachFrozenAt ? "נשמר לפני מחיקה" : null} />
        {copies && <KpiTile testId="copies" label={COPIES_LABEL} value={fmtInt(t.copies)} sub="לא נספר כהקלקה" />}
      </div>
      {reps && reps.total > 0 && (
        <div className="card" style={{ padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }} data-report-reports={`${reps.open}/${reps.total}`}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px", color: reps.open ? "var(--text)" : "var(--text-2)", fontWeight: reps.open ? 700 : 500 }}>
            <ShieldAlert size={16} color={reps.open ? "var(--red)" : "var(--text-3)"} aria-hidden="true" />{reportsSummaryText(reps.open, reps.total)}
          </span>
          <Link href="/ads/reports" style={{ ...ghostBtn, minHeight: "40px", textDecoration: "none" }} data-report-reports-link="">לתור הדיווחים</Link>
        </div>
      )}
      {report.reachFrozenAt && <Banner tone="info"><span data-report-frozen="">{reachFrozenText(report.reachFrozenAt)}</span></Banner>}
      {report.reachUpperBound && <Banner tone="info"><span data-report-upper="">{REACH_UPPER_BOUND_TEXT}</span></Banner>}
      <p style={{ fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.6 }} data-report-definition="">
        {(slots.length ? slots : ["full" as const]).map((s) => VIEW_DEFINITION[s]).join(" ")} אנשים שונים = כמה אנשים ראו לפחות פעם אחת.
      </p>
      {report.days.length === 0 ? (
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-report-empty="">עוד לא הוצג כלום בקמפיין הזה.</p>
      ) : (
        <section className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }} aria-label="לפי יום">
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>חשיפות לפי יום</span>
          <DailyChart days={report.days} />
          <details>
            <summary style={{ fontSize: "13px", color: "var(--text-2)", cursor: "pointer", minHeight: "36px", display: "flex", alignItems: "center" }}>המספרים לכל יום</summary>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse" }} data-report-days="">
                <thead><tr><th style={th}>יום</th><th style={th}>חשיפות</th><th style={th}>אנשים</th><th style={th}>הקלקות</th><th style={th}>CTR</th></tr></thead>
                <tbody>{[...report.days].reverse().map((d) => (
                  <tr key={d.day}><td style={td}>{d.day.split("-").reverse().join(".")}</td><td style={td}>{fmtInt(d.views)}</td><td style={td}>{fmtInt(d.reach)}</td><td style={td}>{fmtInt(d.clicks)}</td><td style={td}>{fmtCtr(d.views, d.clicks)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        </section>
      )}
      {report.creatives.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "8px" }} aria-label="לפי מודעה" data-report-creatives={report.creatives.length}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text)" }}>לפי מודעה</span>
            <span style={{ fontSize: "12px", color: "var(--text-3)" }} data-best-rule="">&quot;הכי טובה&quot; — ה-CTR הגבוה, כשלכל מודעה לפחות {fmtInt(BEST_MIN_VIEWS)} חשיפות.</span>
          </div>
          {report.creatives.map((r) => {
            const c = byId.get(r.creative_id);
            const f = formatOf(r.creative_id);
            const ok = c && c.image_url && /^https:\/\//.test(c.image_url) && isOurAdImage(c.image_url, imageBase) !== false;
            return (
              <div key={r.creative_id} className="card" data-report-creative={r.creative_id} style={{ padding: "10px 12px", display: "flex", gap: "10px", alignItems: "center", borderColor: best === r.creative_id ? "rgba(34,197,94,.5)" : undefined }}>
                <div style={{ width: "48px", height: "48px", borderRadius: "10px", overflow: "hidden", flexShrink: 0, background: "var(--surface)", border: "1px solid var(--border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {ok && <img src={c!.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPosition(c!.focal_x, c!.focal_y) }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    {f && <span data-report-format={f} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#93c5fd" }}><FormatGlyph format={f} size={12} />{FORMAT_INFO[f].label}</span>}
                    {best === r.creative_id && <span data-report-best=""><Tag tone="ok">הכי טובה</Tag></span>}
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.headline ?? "מודעה"}</span>
                  <span className="studio-num" style={{ fontSize: "12.5px", color: "var(--text-2)" }} data-report-creative-clicks={c ? clickKindOf(c) : "link"}>{fmtInt(r.views)} חשיפות · {clicksText(r.clicks, c ? clickKindOf(c) : "link", fmtInt)} · CTR {fmtCtr(r.views, r.clicks)}{copies ? <span data-report-creative-copies={r.copies}> · {fmtInt(r.copies)} העתקות קוד</span> : null}</span>
                </div>
              </div>
            );
          })}
          {fmts.length > 1 && (
            <div className="studio-scroll" style={{ gap: "8px" }} data-report-by-format={fmts.map((x) => x.format).join(",")}>
              {fmts.map((x) => (
                <div key={x.format} className="card" style={{ padding: "10px 12px", flexShrink: 0, minWidth: "140px" }}>
                  <div style={{ fontSize: "12.5px", color: "var(--text-2)", display: "flex", gap: "4px", alignItems: "center" }}><FormatGlyph format={x.format} size={12} />{FORMAT_INFO[x.format].label}</div>
                  <div className="studio-num" style={{ fontSize: "15px", fontWeight: 800, fontFamily: "var(--mono)", marginTop: "2px" }}>CTR {fmtCtr(x.views, x.clicks)}</div>
                  <div className="studio-num" style={{ fontSize: "11.5px", color: "var(--text-3)" }}>{fmtInt(x.views)} חשיפות · {x.ads === 1 ? "מודעה אחת" : `${x.ads} מודעות`}</div>
                  {copies && <div className="studio-num" style={{ fontSize: "11.5px", color: "var(--text-3)" }} data-report-format-copies={x.copies}>{fmtInt(x.copies)} העתקות קוד</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {(report.screens.length > 0 || report.cities.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: "10px" }}>
          {report.screens.length > 0 && (
            <div className="table-wrap"><table style={{ width: "100%", borderCollapse: "collapse" }} data-report-screens="">
              <thead><tr><th style={th}>מסך</th><th style={th}>חשיפות</th><th style={th}>CTR</th></tr></thead>
              <tbody>{report.screens.map((s) => <tr key={s.screen}><td style={{ ...td, fontFamily: "inherit" }}>{SCREEN_LABEL[s.screen]}</td><td style={td}>{fmtInt(s.views)}</td><td style={td}>{fmtCtr(s.views, s.clicks)}</td></tr>)}</tbody>
            </table></div>
          )}
          {report.cities.length > 0 && (
            <div className="table-wrap"><table style={{ width: "100%", borderCollapse: "collapse" }} data-report-cities="">
              <thead><tr><th style={th}>עיר</th><th style={th}>חשיפות</th><th style={th}>CTR</th></tr></thead>
              <tbody>{report.cities.map((c) => <tr key={c.city ?? "-"}><td style={{ ...td, fontFamily: "inherit" }}>{c.city ?? "לא ידוע"}</td><td style={td}>{fmtInt(c.views)}</td><td style={td}>{fmtCtr(c.views, c.clicks)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <a href={`/api/ads/report?campaign=${campaign.id}&format=csv`} style={{ ...ghostBtn, textDecoration: "none" }} data-report-csv=""><Download size={15} />CSV למפרסם</a>
        <Link href={`/ads/campaigns/${campaign.id}/print`} style={{ ...ghostBtn, textDecoration: "none" }} data-report-print=""><Printer size={15} />דוח להדפסה</Link>
      </div>
    </div>
  );
}
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "right", fontSize: "12.5px", fontWeight: 600, color: "var(--text-2)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: "14px", color: "var(--text)", borderBottom: "1px solid var(--border)", fontFamily: "var(--mono)" };

const FACT_LABEL: Record<string, string> = { status: "מצב", format: "פורמט", active: "פעילה", name: "שם", frames: "תמונות", theme: "סגנון", banner_position: "מיקום" };
/** ערכים מוכרים ביומן — בעברית (מה שלא מוכר נשאר כמו שהוא). */
const FACT_VALUE: Record<string, Record<string, string>> = {
  status: { draft: "טיוטה", active: "פעיל", paused: "מושהה", ended: "הסתיים" },
  format: (Object.keys(FORMAT_INFO) as AdFormat[]).reduce<Record<string, string>>((o, f) => { o[f] = FORMAT_INFO[f].label; return o; }, {}),
  theme: THEME_LABEL,
  banner_position: BANNER_POSITION_LABEL,
};
/** עד 3 עובדות קצרות מהיומן (מה השתנה) — רק מפתחות מוכרים, בעברית. */
export function historyFacts(m: Record<string, unknown>): string {
  const out: string[] = [];
  for (const k of Object.keys(FACT_LABEL)) {
    const v = m[k];
    if (v === undefined || v === null || typeof v === "object") continue;
    const known = FACT_VALUE[k];
    const text = k === "active" ? (v ? "כן" : "לא") : known && typeof v === "string" && Object.prototype.hasOwnProperty.call(known, v) ? known[v] : String(v);
    out.push(`${FACT_LABEL[k]}: ${text}`);
    if (out.length === 3) break;
  }
  return out.join(" · ");
}
export function HistoryTabView({ history, now }: { history: AdHistoryRow[] | null; now?: Date }) {
  if (history === null) return <Banner tone="error"><span data-history-error="">לא הצלחנו לקרוא את ההיסטוריה כרגע. רעננו את הדף.</span></Banner>;
  if (history.length === 0) return <p style={{ fontSize: "14px", color: "var(--text-2)" }} data-history-empty="">עוד אין פעולות ביומן על הקמפיין הזה.</p>;
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }} data-campaign-tab="history" data-history={history.length}>
      {history.map((h, i) => {
        const l = AUDIT_LABELS[h.action];
        const facts = historyFacts(h.metadata);
        return (
          <li key={`${h.created_at}-${i}`} className="card" style={{ padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start" }} data-history-row={h.action}>
            <span aria-hidden="true" style={{ width: "10px", height: "10px", borderRadius: "50%", marginTop: "6px", flexShrink: 0, background: l?.color ?? "var(--text-3)" }} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{l?.label ?? h.action}{h.entity_type === "ad_creative" ? <span style={{ color: "var(--text-2)", fontWeight: 500 }}> · מודעה</span> : null}</span>
              {facts && <span style={{ fontSize: "12.5px", color: "var(--text-2)" }}>{facts}</span>}
              <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{ilWhen(h.created_at, now)}{h.admin_email ? <> · <bdi dir="ltr">{h.admin_email}</bdi></> : null}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PlanTab({ campaign, contracts, buildings, cities, canManage, today }: {
  campaign: AdCampaignRow; contracts: CampaignPageData["contracts"]; buildings: AdBuildingOption[]; cities: string[]; canManage: boolean; today: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CampaignForm>(() => formFromCampaign(campaign));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // the estimate is ads.manage (review #4): a read-only viewer does not ask, and sees no gauge (not "לא הצלחנו להעריך")
  const reach = useReach(form, canManage);
  const served = campaign.serves > 0;
  const ended = campaign.status === "ended";
  const locked = !canManage || ended;
  const dirty = JSON.stringify(campaignPayload(campaign.id, form)) !== JSON.stringify(campaignPayload(campaign.id, formFromCampaign(campaign)));
  const problem = formProblem(form);
  const usable = contracts.filter((k) => k.advertiser_id === campaign.advertiser_id && (k.id === campaign.contract_id || (k.status !== "cancelled" && k.ends_on >= today)));
  async function save() {
    if (busy || problem) return;
    setBusy(true); setErr(null); setNotice(null);
    const r = await postAds(campaignPayload(campaign.id, form));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setNotice("השינויים נשמרו.");
    router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-campaign-tab="audience">
      {ended && <Banner tone="info">הקמפיין הסתיים, ולכן הוא לקריאה בלבד. לקמפיין דומה — שכפול.</Banner>}
      <section className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }} aria-label="פרטים">
        <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)" }}>פרטים</span>
        <Field label="שם הקמפיין"><input value={form.name} disabled={locked} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} maxLength={80} style={inputStyle} data-plan-field="name" /></Field>
        <Field label="חוזה" hint={served ? AD_LOCKED_TEXT.campaign : undefined}>
          <select value={form.contract_id} disabled={locked || served} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, contract_id: e.target.value })} style={inputStyle} data-plan-field="contract">
            {usable.map((k) => <option key={k.id} value={k.id}>{k.label}{k.status === "draft" ? " (טיוטה)" : ""}</option>)}
          </select>
        </Field>
      </section>
      <section className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }} aria-label="קהל">
        <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)" }}>קהל</span>
        <AudienceEditor value={form} onChange={(v) => setForm({ ...form, ...v })} cities={cities} buildings={buildings} reach={canManage ? reach : null} disabled={locked} />
      </section>
      <section className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }} aria-label="תזמון ויעד">
        <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)" }}>תזמון ויעד</span>
        <ScheduleEditorView value={form} onChange={(v) => setForm({ ...form, ...v })} today={today} disabled={locked}
          note={campaign.status === "active" ? "הקמפיין פעיל — שינוי נכנס לתוקף מיד אחרי השמירה." : null} />
      </section>
      {notice && <Banner tone="ok"><span data-plan-notice="">{notice}</span></Banner>}
      {err && <Banner tone="error"><span data-plan-error="">{err}</span></Banner>}
      {!locked && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", position: "sticky", bottom: 0, background: "var(--bg)", padding: "10px 0" }}>
          <button type="button" style={{ ...solidBtn("var(--blue)"), opacity: dirty && !busy && !problem ? 1 : 0.6 }} disabled={!dirty || busy || !!problem} onClick={() => void save()} data-plan-save="">
            {busy ? "שומרים…" : "שמירת השינויים"}
          </button>
          {dirty && <button type="button" style={ghostBtn} disabled={busy} onClick={() => setForm(formFromCampaign(campaign))} data-plan-reset="">ביטול השינויים</button>}
          {dirty && problem && <span style={{ fontSize: "13px", color: "var(--yellow)" }} data-plan-problem="">{problem}</span>}
        </div>
      )}
    </div>
  );
}

export default function CampaignStudio({ today, campaign, creatives, report, serves, history, contracts, advertiser, buildings, cities, canManage, initialTab = "performance", imageBase = STUDIO_IMAGE_BASE }: {
  today: string; campaign: AdCampaignRow; creatives: AdCreativeRow[]; report: AdReport; serves: Record<string, number>; history: AdHistoryRow[] | null;
  contracts: CampaignPageData["contracts"]; advertiser: AdAdvertiserRow | null; buildings: AdBuildingOption[]; cities: string[]; canManage: boolean;
  initialTab?: CampaignTab; imageBase?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<CampaignTab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** תשובה לא ברורה לשכפול — ייתכן שכבר נוצר: אין שכפול שני עד רענון. */
  const [stale, setStale] = useState<"dup" | null>(null);
  const c = campaign;
  const served = c.serves > 0;
  const contract = contracts.find((k) => k.id === c.contract_id) ?? null;
  const value = contract ? contractValue(contract.pricing, contract.price_ils, { views: c.views, clicks: c.clicks }) : null;
  const live = c.phase === "running" ? liveNow(c) : null;
  const best = bestAd(report.creatives);
  // ADS-2ב1: הושהה בגלל דיווחים — רק כשהוא באמת מושהה עכשיו (קמפיין שתאריכיו עברו — "הסתיים", כמו תמיד)
  const byReports = c.phase === "paused" && pausedByReports(c);
  const go = (t: CampaignTab) => { setTab(t); window.history.replaceState(null, "", t === "performance" ? `/ads/campaigns/${c.id}` : `/ads/campaigns/${c.id}?tab=${t}`); };

  async function status(next: "active" | "paused" | "ended", confirmText?: string) {
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(next); setErr(null); setNotice(null);
    const r = await postAds({ action: "campaign.status", id: c.id, status: next });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setNotice(next === "active" ? "הקמפיין פועל." : next === "paused" ? "הקמפיין הושהה." : "הקמפיין הסתיים.");
    router.refresh();
  }
  async function duplicate() {
    if (busy) return;
    setBusy("dup"); setErr(null);
    const r = await postAds<{ id: string; creatives?: string; skipped_outside?: number }>({ action: "campaign.duplicate", id: c.id });
    setBusy(null);
    if (!r.ok) { setErr(r.error); if (lockedAfter(r, true)) setStale("dup"); return; }
    router.push(duplicateHref(r.data.id, r.data.creatives, r.data.skipped_outside));
  }
  async function remove() {
    if (busy || !window.confirm(`למחוק את "${c.name}"? הקמפיין עוד לא הוצג, ולכן הוא נמחק לגמרי.`)) return;
    setBusy("del"); setErr(null);
    const r = await postAds({ action: "campaign.delete", id: c.id });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    router.replace("/ads");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }} data-campaign-studio={c.id}>
      <style>{STUDIO_CSS}</style>
      <Link href="/ads" style={{ ...ghostBtn, alignSelf: "flex-start", textDecoration: "none" }}><ArrowRight size={16} />לסטודיו</Link>
      <header className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }} data-campaign-summary="">
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <AdvertiserAvatar name={c.advertiser || c.name} logo={c.advertiser_logo} color={c.advertiser_color} size={48} imageBase={imageBase} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", lineHeight: 1.3, overflowWrap: "anywhere" }}>{c.name}</h1>
            <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>
              {advertiser ? <Link href={`/ads/advertisers/${advertiser.id}`} style={{ color: "var(--text-2)" }}>{c.advertiser}</Link> : c.advertiser}
              {contract ? <> · <bdi>{fmtIls(contract.price_ils)}</bdi> {PRICING_LABEL[contract.pricing]}</> : null} · {fmtRange(c.starts_on, c.ends_on)}
            </div>
          </div>
          {byReports ? <span data-campaign-tag="reports"><Tag tone="danger">{PAUSED_BY_REPORTS_SHORT}</Tag></span> : <Tag tone={c.tone as Tone}>{c.phase_label}</Tag>}
        </div>
        <PlacementIcons formats={c.placements} />
        {byReports && c.paused_by_reports_at && <ReportsPausedBanner at={c.paused_by_reports_at} />}
        <p style={{ fontSize: "13.5px", color: "var(--text)", lineHeight: 1.6 }} data-campaign-audience="">{audienceSummary(c)}</p>
        {live && <p style={{ fontSize: "13.5px", fontWeight: 600, color: live.live ? "var(--green)" : "var(--yellow)", lineHeight: 1.6 }} data-campaign-live={live.live ? "on" : "off"}>{live.live ? "רץ עכשיו." : `לא רץ עכשיו: ${live.reason}`}</p>}
        {value !== null && contract && <span className="studio-num" style={{ fontSize: "12.5px", color: "var(--text-2)" }} data-campaign-value="">שווי עד עכשיו ({PRICING_LABEL[contract.pricing]}): <b style={{ color: "var(--text)" }}>{fmtIls(value)}</b></span>}
        {canManage && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {c.status === "paused" && <button type="button" style={{ ...solidBtn("#16a34a"), minHeight: "44px", opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={() => void status("active", byReports ? RESUME_REPORTED_CONFIRM : undefined)} data-campaign-action="resume"><Play size={16} />המשך</button>}
            {c.status === "active" && <button type="button" style={ghostBtn} disabled={!!busy} onClick={() => void status("paused")} data-campaign-action="pause"><Pause size={15} />השהיה</button>}
            {c.status !== "ended" && c.status !== "draft" && (
              <button type="button" style={ghostBtn} disabled={!!busy} onClick={() => void status("ended", "לסיים את הקמפיין? קמפיין שהסתיים לא חוזר לפעול (אפשר לשכפל אותו).")} data-campaign-action="end"><Square size={15} />סיום</button>
            )}
            <button type="button" style={{ ...ghostBtn, opacity: stale === "dup" ? 0.6 : 1 }} disabled={!!busy || stale === "dup"} onClick={() => void duplicate()} data-campaign-action="duplicate"><Copy size={15} />שכפול</button>
            {!served && <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} disabled={!!busy} onClick={() => void remove()} data-campaign-action="delete"><Trash2 size={15} />מחיקה</button>}
          </div>
        )}
      </header>
      {notice && <Banner tone="ok"><span data-campaign-notice="">{notice}</span></Banner>}
      {err && (
        <Banner tone="error" action={stale ? <Link href="/ads" style={{ ...ghostBtn, textDecoration: "none" }} data-campaign-recheck="">לרשימת הקמפיינים</Link> : undefined}>
          <span data-campaign-error="">{err}</span>
        </Banner>
      )}
      <ScrollTabs label="הקמפיין" testId="campaign" value={tab} onChange={go} tabs={CAMPAIGN_TABS.map((t) => ({ key: t.key, label: t.label, ...(t.key === "ads" ? { count: creatives.length } : {}) }))} />
      {tab === "performance" && <PerformanceTabView campaign={c} report={report} creatives={creatives} imageBase={imageBase} />}
      {tab === "ads" && (
        <div data-campaign-tab="ads">
          <CreativeList campaignId={c.id} creatives={creatives} serves={serves} advertiser={c.advertiser} advertiserLogo={c.advertiser_logo} brandColor={advertiser?.brand_color ?? c.advertiser_color}
            imageBase={imageBase} canManage={canManage && c.status !== "ended"} best={best} today={today} campaignEndsOn={c.ends_on} />
        </div>
      )}
      {tab === "audience" && <PlanTab campaign={c} contracts={contracts} buildings={buildings} cities={cities} canManage={canManage} today={today} />}
      {tab === "why" && (
        <div data-campaign-tab="why" className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <span style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)" }}>למה משתמש לא רואה את הקמפיין הזה?</span>
          {c.slots.length === 0
            ? c.creatives_active > 0 && c.creatives_ended >= c.creatives_active
              ? <Banner tone="warn"><span data-why-none="offer">{OFFER_ENDED_LIVE_TEXT}</span></Banner>
              : <Banner tone="warn"><span data-why-none="">אין בקמפיין מודעה פעילה, ולכן הוא לא מוצג לאף אחד. מפעילים או מוסיפים מודעה בלשונית &quot;מודעות&quot;.</span></Banner>
            : <ExplainBox slots={c.slots} focusCampaign={c.id} />}
          {c.slots.length > 0 && <span style={{ fontSize: "12.5px", color: "var(--text-3)" }}>הקמפיין מוצג ב: {c.placements.map((f) => formatText(f)).join(", ")}.</span>}
        </div>
      )}
      {tab === "history" && <HistoryTabView history={history} />}
    </div>
  );
}
