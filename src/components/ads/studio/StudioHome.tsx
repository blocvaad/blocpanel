"use client";
// studio/StudioHome — מסך הבית של "סטודיו הפרסום" (bloc ADS-2א v2, החלטה 383): "קמפיין חדש", טווח (היום / 7 ימים / 30 יום),
// מדדים (חשיפות, הקלקות, CTR, קמפיינים פעילים, אנשים שונים — קריאה שנכשלה: "—", לא 0), לשוניות מצב עם מספרים, חיפוש וסינון
// לפי מפרסם, וכרטיס לכל קמפיין: הדמות של המפרסם, מצב, איפה הוא מוצג (הפורמטים של המודעות הפעילות), קצב מול היעד, קו של 7
// ימים, CTR, "מסתיים בעוד N ימים", ופעולות מהירות (השהיה / המשך / שכפול / פתיחה) — פעולה אחת בכל פעם; תשובה לא ברורה לשכפול —
// אין שכפול שני. ריק / טוען / נכשל — שלושה מצבים שונים.
// StudioHome — המצב והבקשות; StudioHomeView / CampaignCard / StudioHomeSkeleton — התצוגה (טהורה).
// ADS-2ב1 (החלטה 390): תג "3 דיווחים חדשים" (לתור הדיווחים) בראש המסך, ו"הושהה בגלל דיווחים" (באדום) בכרטיס של קמפיין כזה.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pause, Play, Copy, Search, RefreshCw, ChevronLeft, ShieldAlert } from "lucide-react";
import { Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { postAds, Progress, TONE_COLOR } from "../adsKit";
import { duplicateHref, lockedAfter } from "@/lib/adsUi";
import { ADS_SQL_MISSING, fmtInt, fmtCtr, liveNow, type Tone } from "@/lib/ads";
import {
  RANGES, RANGE_LABEL, STUDIO_TABS, TEMPLATES, filterCampaigns, paceView, sparkValues, studioKpis, tabCounts, whenText,
  type StudioRange, type StudioTab,
} from "@/lib/adsStudio";
import type { AdAdvertiserRow, AdCampaignRow, CampaignDaily } from "@/lib/adsServer";
import { PAUSED_BY_REPORTS_SHORT, pausedByReports, reportsCountText } from "@/lib/adsReports";
import { AdvertiserAvatar, KpiTile, PlacementIcons, ScrollTabs, Segmented, Sparkline, StudioNav, STUDIO_CSS, STUDIO_IMAGE_BASE } from "./kit";

export interface CampaignCardProps {
  c: AdCampaignRow; daily: CampaignDaily | null | undefined; today: string; canManage: boolean; busy: boolean; anyBusy: boolean; staleDup: boolean;
  imageBase: string | null; onPause: () => void; onResume: () => void; onDuplicate: () => void; now?: Date;
}
export function CampaignCard({ c, daily, today, canManage, busy, anyBusy, staleDup, imageBase, onPause, onResume, onDuplicate, now }: CampaignCardProps) {
  const pace = c.phase === "running" ? paceView(c, now?.getTime()) : null;
  const spark = sparkValues(daily, today);
  const when = whenText(c, today);
  const live = c.phase === "running" ? liveNow(c, now) : null;
  const href = `/ads/campaigns/${c.id}`;
  const byReports = c.phase === "paused" && pausedByReports(c);
  return (
    <article className="card" data-campaign-card={c.id} data-campaign-phase={c.phase} aria-busy={busy || undefined}
      style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <AdvertiserAvatar name={c.advertiser || c.name} logo={c.advertiser_logo} color={c.advertiser_color} size={42} imageBase={imageBase} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={href} style={{ color: "var(--text)", textDecoration: "none", fontSize: "15.5px", fontWeight: 800, lineHeight: 1.3, display: "block", overflowWrap: "anywhere" }} data-campaign-open={c.id}>{c.name}</Link>
          <div style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "2px" }}>{c.advertiser}</div>
        </div>
        {byReports ? <span data-campaign-card-tag="reports"><Tag tone="danger">{PAUSED_BY_REPORTS_SHORT}</Tag></span> : <Tag tone={c.tone as Tone}>{c.phase_label}</Tag>}
      </div>
      <PlacementIcons formats={c.placements} />
      {live && !live.live && <span style={{ fontSize: "12.5px", color: "var(--yellow)", lineHeight: 1.5 }} data-campaign-card-live="off">פעיל, אבל לא רץ עכשיו: {live.reason}</span>}
      {pace ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }} data-campaign-pace={pace.state}>
          <div style={{ position: "relative" }}>
            <Progress value={c.views} max={c.goal_views ?? 0} label={`${c.name}: חשיפות מול היעד`} color={pace.state === "behind" ? TONE_COLOR.wait : "var(--blue)"} />
            <span aria-hidden="true" title="צפוי עד עכשיו" style={{ position: "absolute", top: "-3px", right: `${pace.expectedPct}%`, width: "2px", height: "12px", background: "var(--text-2)", borderRadius: "1px" }} />
          </div>
          <span className="studio-num" style={{ fontSize: "12.5px", color: pace.state === "behind" ? "var(--yellow)" : "var(--text-2)" }}>
            <b style={{ color: pace.state === "behind" ? "var(--yellow)" : pace.state === "ahead" ? "var(--green)" : "var(--text)" }}>{pace.label}</b> · {fmtInt(c.views)} מתוך {fmtInt(c.goal_views)} ({pace.pct}%)
          </span>
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "10px" }}>
        <div className="studio-num" style={{ display: "flex", gap: "14px" }}>
          <span><span style={{ display: "block", fontSize: "11.5px", color: "var(--text-2)" }}>חשיפות</span><b style={{ fontSize: "15px", fontFamily: "var(--mono)" }}>{fmtInt(c.views)}</b></span>
          <span><span style={{ display: "block", fontSize: "11.5px", color: "var(--text-2)" }}>CTR</span><b style={{ fontSize: "15px", fontFamily: "var(--mono)" }}>{fmtCtr(c.views, c.clicks)}</b></span>
        </div>
        <Sparkline values={spark} label={`${c.name}: חשיפות ב-7 הימים האחרונים`} />
      </div>
      {when && <span style={{ fontSize: "12.5px", color: "var(--text-2)" }} data-campaign-when="">{when}</span>}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {canManage && c.status === "active" && (c.phase === "running" || c.phase === "scheduled" || c.phase === "blocked") && (
          <button type="button" style={qbtn} disabled={anyBusy} onClick={onPause} data-quick="pause"><Pause size={14} />השהיה</button>
        )}
        {canManage && c.status === "paused" && !byReports && (
          <button type="button" style={qbtn} disabled={anyBusy} onClick={onResume} data-quick="resume"><Play size={14} />המשך</button>
        )}
        {/* ADS-2ב1: paused by reports — the way back is a decision in the queue ("בדקנו — תקין" resumes and closes the reports) */}
        {canManage && byReports && (
          <Link href="/ads/reports" style={{ ...qbtn, textDecoration: "none", color: "var(--red)" }} data-quick="reports"><ShieldAlert size={14} />לתור הדיווחים</Link>
        )}
        {canManage && (
          <button type="button" style={{ ...qbtn, opacity: staleDup ? 0.6 : 1 }} disabled={anyBusy || staleDup} onClick={onDuplicate} data-quick="duplicate"><Copy size={14} />שכפול</button>
        )}
        <Link href={href} style={{ ...qbtn, textDecoration: "none", marginInlineStart: "auto" }} data-quick="open">{c.phase === "draft" ? "המשך עריכה" : "פתיחה"}<ChevronLeft size={14} /></Link>
      </div>
    </article>
  );
}
const qbtn: React.CSSProperties = { ...ghostBtn, minHeight: "40px", padding: "0 12px", fontSize: "13.5px" };

export function StudioHomeSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }} data-studio-home="loading" aria-busy="true">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "8px" }}>
        {[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} height={76} />)}
      </div>
      <SkeletonCard height={44} />
      {[0, 1, 2].map((i) => <SkeletonCard key={i} height={200} />)}
    </div>
  );
}

export interface StudioHomeViewProps {
  state: "ok" | "error" | "missing"; today: string; campaigns: AdCampaignRow[]; advertisers: AdAdvertiserRow[];
  daily: Record<string, CampaignDaily | null>; enabled: boolean; canManage: boolean; imageBase: string | null;
  range: StudioRange; onRange: (r: StudioRange) => void; tab: StudioTab; onTab: (t: StudioTab) => void;
  q: string; onQ: (q: string) => void; adv: string; onAdv: (a: string) => void;
  busy: string | null; staleDup: boolean; notice: string | null; err: string | null; onRetry: () => void;
  onPause: (c: AdCampaignRow) => void; onResume: (c: AdCampaignRow) => void; onDuplicate: (c: AdCampaignRow) => void; now?: Date;
  /** ADS-2ב1: דיווחים פתוחים (התג "3 דיווחים חדשים"); null — לא ידוע (לפני SQL 231 / קריאה שנכשלה): בלי תג. */
  reportsCount?: number | null;
}

/** ADS-2ב1: התג בראש מסך הבית — רק כשיש דיווח פתוח. */
export function ReportsBadge({ count }: { count: number | null | undefined }) {
  if (!count || count <= 0) return null;
  return (
    <Link href="/ads/reports" data-studio-reports-badge={count}
      style={{ alignSelf: "flex-start", minHeight: "44px", padding: "0 14px", borderRadius: "99px", display: "inline-flex", alignItems: "center", gap: "8px",
        border: "1px solid rgba(239,68,68,.5)", background: "rgba(239,68,68,.1)", color: "var(--text)", fontSize: "14px", fontWeight: 700, textDecoration: "none" }}>
      <ShieldAlert size={16} color="var(--red)" aria-hidden="true" />{reportsCountText(count)}<ChevronLeft size={15} aria-hidden="true" />
    </Link>
  );
}

export function StudioHomeView(p: StudioHomeViewProps) {
  const header = (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>סטודיו הפרסום</h1>
          <p style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>קמפיינים, מודעות בשבעה פורמטים, וקהל — במקום אחד.</p>
        </div>
        {p.canManage && p.state === "ok" && (
          <Link href="/ads/new" style={{ ...solidBtn("var(--blue)"), textDecoration: "none" }} data-studio-new=""><Plus size={17} />קמפיין חדש</Link>
        )}
      </div>
      <StudioNav active="campaigns" reports={p.reportsCount} />
      <ReportsBadge count={p.reportsCount} />
    </div>
  );
  if (p.state !== "ok") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-studio-home={p.state}>
        {header}
        {p.state === "missing"
          ? <Banner tone="warn"><span data-ads-missing="">{ADS_SQL_MISSING}</span></Banner>
          : <Banner tone="error" action={<button type="button" style={ghostBtn} onClick={p.onRetry} data-studio-retry=""><RefreshCw size={15} />נסו שוב</button>}>
              <span data-ads-error="">לא הצלחנו לטעון את הקמפיינים. זו תקלה בקריאה — הנתונים עצמם לא נפגעו.</span>
            </Banner>}
      </div>
    );
  }
  const k = studioKpis(p.campaigns, p.daily, p.range, p.today);
  const counts = tabCounts(p.campaigns);
  const shown = filterCampaigns(p.campaigns, { tab: p.tab, q: p.q, advertiser: p.adv });
  const advOptions = p.advertisers.filter((a) => p.campaigns.some((c) => c.advertiser_id === a.id));
  const dash = (n: number | null) => (n === null ? "—" : fmtInt(n));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }} data-studio-home="ok">
      <style>{STUDIO_CSS}</style>
      {header}
      {!p.enabled && (
        <Banner tone="warn" action={<Link href="/ads/settings" style={{ ...ghostBtn, textDecoration: "none" }}>להגדרות</Link>}>
          <span data-ads-off="">הפרסומות כבויות לכל המערכת. אף דייר לא רואה פרסומת, גם כשיש קמפיין פעיל.</span>
        </Banner>
      )}
      {p.notice && <Banner tone="ok"><span data-ads-notice="">{p.notice}</span></Banner>}
      {p.err && (
        <Banner tone="error" action={p.staleDup ? <button type="button" style={ghostBtn} onClick={p.onRetry} data-studio-recheck="">רענון</button> : undefined}>
          <span data-ads-action-error="">{p.err}</span>
        </Banner>
      )}

      {p.campaigns.length === 0 ? (
        <div className="card" style={{ padding: "24px 18px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }} data-studio-empty="">
          <p style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)" }}>הקמפיין הראשון — בכמה דקות</p>
          <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }}>
            בוחרים מפרסם (או מוסיפים אחד), מעלים תמונה אחת, ובוחרים באילו פורמטים להציג — כרטיס, חלון קופץ, מסך מלא, סטורי, פס, כרטיס ברשימה או קרוסלה.
            אחר כך קהל ותזמון, ופרסום.
          </p>
          {p.canManage && <Link href="/ads/new" style={{ ...solidBtn("var(--blue)"), textDecoration: "none" }} data-studio-empty-new=""><Plus size={17} />קמפיין חדש</Link>}
          {p.canManage && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
              <span style={{ fontSize: "13px", color: "var(--text-2)" }}>או להתחיל מתבנית:</span>
              <div className="studio-scroll" data-studio-templates="">
                {TEMPLATES.map((t) => (
                  <Link key={t.key} href={`/ads/new?template=${t.key}`} data-studio-template={t.key}
                    style={{ minHeight: "44px", padding: "0 14px", borderRadius: "99px", border: "1px dashed var(--border-2)", color: "var(--text)", fontSize: "14px", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {t.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <Segmented label="טווח" testId="range" value={p.range} onChange={p.onRange} options={RANGES.map((r) => ({ key: r, label: RANGE_LABEL[r] }))} />
            {k.partial && <span style={{ fontSize: "12.5px", color: "var(--yellow)" }} data-kpi-partial="">חלק מהקמפיינים לא נטענו — המספרים חלקיים.</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "8px" }} data-studio-kpis={p.range}>
            <KpiTile testId="views" label={`חשיפות · ${RANGE_LABEL[p.range]}`} value={dash(k.views)} sub={k.views === null ? "לא נטען" : null} />
            <KpiTile testId="clicks" label="הקלקות" value={dash(k.clicks)} sub={k.clicks === null ? "לא נטען" : null} />
            <KpiTile testId="ctr" label="CTR" value={k.ctr} />
            <KpiTile testId="active" label="קמפיינים פעילים" value={fmtInt(k.active)} />
            <KpiTile testId="reach" label="אנשים שונים" value={dash(k.reach)} sub={k.reach === null ? "לא נטען" : "סכום לפי קמפיין"} />
          </div>
          <ScrollTabs label="מצב" testId="status" value={p.tab} onChange={p.onTab} tabs={STUDIO_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))} />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
              <input value={p.q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.onQ(e.target.value)} placeholder="חיפוש קמפיין או מפרסם" aria-label="חיפוש"
                style={{ ...inputStyle, paddingRight: "36px" }} data-studio-search="" />
            </div>
            {advOptions.length > 1 && (
              <select value={p.adv} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => p.onAdv(e.target.value)} aria-label="מפרסם" style={{ ...inputStyle, flex: "0 1 200px", width: "auto" }} data-studio-adv="">
                <option value="">כל המפרסמים</option>
                {advOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </div>
          {shown.length === 0 ? (
            <p style={{ fontSize: "14px", color: "var(--text-2)", padding: "8px 2px" }} data-studio-none="">{p.q || p.adv ? "אין קמפיין שמתאים לחיפוש." : "אין קמפיינים בלשונית הזו."}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(300px,100%),1fr))", gap: "10px" }} data-studio-cards={shown.length}>
              {shown.map((c) => (
                <CampaignCard key={c.id} c={c} daily={p.daily[c.id]} today={p.today} canManage={p.canManage} busy={p.busy === c.id} anyBusy={!!p.busy} staleDup={p.staleDup}
                  imageBase={p.imageBase} now={p.now} onPause={() => p.onPause(c)} onResume={() => p.onResume(c)} onDuplicate={() => p.onDuplicate(c)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StudioHome(props: Omit<StudioHomeViewProps, "range" | "onRange" | "tab" | "onTab" | "q" | "onQ" | "adv" | "onAdv" | "busy" | "staleDup" | "notice" | "err" | "onRetry" | "onPause" | "onResume" | "onDuplicate" | "imageBase"> & { initialTab?: StudioTab; imageBase?: string | null }) {
  const router = useRouter();
  const [range, setRange] = useState<StudioRange>("7d");
  const [tab, setTab] = useState<StudioTab>(props.initialTab ?? "all");
  const [q, setQ] = useState("");
  const [adv, setAdv] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** תשובה לא ברורה לשכפול — ייתכן שכבר נוצר עותק: אין שכפול שני עד רענון. */
  const [stale, setStale] = useState<"dup" | null>(null);

  async function status(c: AdCampaignRow, next: "active" | "paused") {
    if (busy) return;
    setBusy(c.id); setErr(null); setNotice(null);
    const r = await postAds({ action: "campaign.status", id: c.id, status: next });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setNotice(next === "active" ? `"${c.name}" חזר לפעול.` : `"${c.name}" הושהה.`);
    router.refresh();
  }
  async function duplicate(c: AdCampaignRow) {
    if (busy || stale) return;
    setBusy(c.id); setErr(null); setNotice(null);
    const r = await postAds<{ id: string; creatives?: string; skipped_outside?: number }>({ action: "campaign.duplicate", id: c.id });
    setBusy(null);
    if (!r.ok) { setErr(r.error); if (lockedAfter(r, true)) setStale("dup"); return; }
    router.push(duplicateHref(r.data.id, r.data.creatives, r.data.skipped_outside));
  }
  return (
    <StudioHomeView {...props} imageBase={props.imageBase === undefined ? STUDIO_IMAGE_BASE : props.imageBase}
      range={range} onRange={setRange} tab={tab} onTab={(t) => { setTab(t); window.history.replaceState(null, "", t === "all" ? "/ads" : `/ads?tab=${t}`); }}
      q={q} onQ={setQ} adv={adv} onAdv={setAdv} busy={busy} staleDup={stale === "dup"} notice={notice} err={err}
      onRetry={() => { setErr(null); setStale(null); router.refresh(); }}
      onPause={(c) => void status(c, "paused")} onResume={(c) => void status(c, "active")} onDuplicate={(c) => void duplicate(c)} />
  );
}
