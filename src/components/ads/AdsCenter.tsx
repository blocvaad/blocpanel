"use client";
// AdsCenter — מסך "פרסומות" בפאנל (bloc ADS-1; החלטות 74–75): קמפיינים, מפרסמים וחוזים, הגדרות.
//   • קמפיינים: מה רץ עכשיו, כמה נמסר מול היעד ובאיזה קצב, CTR, היום — ולחיצה פותחת את הקמפיין.
//   • מפרסמים וחוזים: מי, באיזה מחיר ועד מתי; כמה נמסר בכל חוזה ומה השווי לפי מודל התמחור.
//   • הגדרות: המתג לכל המערכת, מכשירי בדיקה (תצוגה מקדימה בלי כללים ובלי ספירה), בניינים בלי פרסומות,
//     והכללים הקבועים (החלטה 74) — לקריאה.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, FileText, Power, Search, X } from "lucide-react";
import { Section, Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { Toggle } from "@/components/ui/broadcastKit";
import { postAds, Progress, TONE_COLOR } from "./adsKit";
import { AdvertiserModal, ContractModal } from "./AdsForms";
import {
  fmtInt, fmtIls, fmtCtr, fmtRange, PRICING_LABEL, CONTRACT_STATUS_LABEL, ilTodayKey, type Tone,
} from "@/lib/ads";
import type { AdAdvertiserRow, AdCampaignRow, AdContractRow, AdSettingsView, AdBuildingOption } from "@/lib/adsServer";

type Tab = "campaigns" | "advertisers" | "settings";
type Filter = "all" | "running" | "scheduled" | "draft" | "paused" | "ended";
const FILTERS: Array<{ key: Filter; label: string; match: (c: AdCampaignRow) => boolean }> = [
  { key: "all", label: "הכל", match: () => true },
  { key: "running", label: "פעילים", match: (c) => c.phase === "running" },
  { key: "scheduled", label: "מתוזמנים", match: (c) => c.phase === "scheduled" },
  { key: "draft", label: "טיוטות", match: (c) => c.phase === "draft" },
  { key: "paused", label: "מושהים או חסומים", match: (c) => c.phase === "paused" || c.phase === "blocked" },
  { key: "ended", label: "הסתיימו", match: (c) => c.phase === "ended" || c.phase === "goal" },
];

/** טקסט משמאל לימין (טלפון, ח.פ, מספר חוזה) בתוך משפט בעברית — בלי שהסוגריים והמקפים יתהפכו, ובלי שבירת שורה
 *  באמצע המספר (מקף שאינו נשבר). */
export const ltr = (s: string) => `\u2066${s.replace(/-/g, "\u2011")}\u2069`;
/** טבלה במסך רחב, כרטיסים בטלפון. */
export const ADS_RESPONSIVE_CSS = `
.ads-only-wide { display: block; }
.ads-only-narrow { display: none; }
@media (max-width: 640px) { .ads-only-wide { display: none; } .ads-only-narrow { display: flex; } }
`;
const statCell = (label: string, value: string) => (
  <div key={label}>
    <div style={{ fontSize: "13px", color: "var(--text-2)" }}>{label}</div>
    <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--mono)", marginTop: "2px" }}>{value}</div>
  </div>
);

const th: React.CSSProperties = { padding: "10px 12px", textAlign: "right", fontSize: "13px", fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "12px", fontSize: "14.5px", color: "var(--text)", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };

export default function AdsCenter({ today, settings, advertisers, campaigns, buildings, canManage }: {
  today: string; settings: AdSettingsView; advertisers: AdAdvertiserRow[]; campaigns: AdCampaignRow[];
  buildings: AdBuildingOption[]; canManage: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "advertisers" || t === "settings") setTab(t);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "campaigns" ? window.location.pathname : `${window.location.pathname}?tab=${t}`);
  };
  const done = (msg: string) => { setNotice(msg); router.refresh(); };

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "campaigns", label: `קמפיינים (${campaigns.length})` },
    { key: "advertisers", label: `מפרסמים וחוזים (${advertisers.filter((a) => !a.archived_at).length})` },
    { key: "settings", label: "הגדרות" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <style>{ADS_RESPONSIVE_CSS}</style>
      {!settings.enabled && (
        <Banner tone="warn" action={tab !== "settings" ? <button type="button" style={ghostBtn} onClick={() => go("settings")}>להגדרות</button> : undefined}>
          <span data-ads-off="">הפרסומות כבויות לכל המערכת. אף דייר לא רואה פרסומת, גם כשיש קמפיין פעיל.</span>
        </Banner>
      )}
      <div className="chips" role="tablist" aria-label="פרסומות" style={{ gap: "6px" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-tab={t.key}
            className={`chip${tab === t.key ? " active" : ""}`} onClick={() => go(t.key)}
            style={{ minHeight: "44px", ...(tab === t.key ? {} : { color: "var(--text-2)" }) }}>
            {t.label}
          </button>
        ))}
      </div>
      {notice && (
        <Banner tone="ok" action={<button type="button" style={ghostBtn} onClick={() => setNotice(null)}>סגירה</button>}>
          <span data-ads-notice="">{notice}</span>
        </Banner>
      )}
      {tab === "campaigns" && <CampaignsTab campaigns={campaigns} canManage={canManage} hasContracts={advertisers.some((a) => a.contracts.length > 0)} onAdvertisers={() => go("advertisers")} />}
      {tab === "advertisers" && <AdvertisersTab advertisers={advertisers} canManage={canManage} onDone={done} />}
      {tab === "settings" && <SettingsTab settings={settings} buildings={buildings} canManage={canManage} onDone={done} today={today} />}
    </div>
  );
}

// ── קמפיינים ────────────────────────────────────────────────────────────────
function CampaignsTab({ campaigns, canManage, hasContracts, onAdvertisers }: {
  campaigns: AdCampaignRow[]; canManage: boolean; hasContracts: boolean; onAdvertisers: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = campaigns.filter(FILTERS.find((f) => f.key === filter)!.match);
  const running = campaigns.filter((c) => c.phase === "running");
  const todayViews = campaigns.reduce((s, c) => s + c.today_views, 0);
  const todayClicks = campaigns.reduce((s, c) => s + c.today_clicks, 0);
  const views = campaigns.reduce((s, c) => s + c.views, 0);
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }} data-ads-stats="">
        {[
          { label: "קמפיינים פעילים", value: fmtInt(running.length) },
          { label: "חשיפות היום", value: fmtInt(todayViews) },
          { label: "הקלקות היום", value: fmtInt(todayClicks) },
          { label: "CTR מצטבר", value: fmtCtr(views, clicks) },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{s.label}</div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text)", marginTop: "6px", fontFamily: "var(--mono)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
        <div className="chips" role="radiogroup" aria-label="סינון" style={{ gap: "6px" }}>
          {FILTERS.map((f) => {
            const count = campaigns.filter(f.match).length;
            if (f.key !== "all" && count === 0) return null;
            return (
              <button key={f.key} type="button" role="radio" aria-checked={filter === f.key} data-filter={f.key}
                className={`chip${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}
                style={{ minHeight: "44px", ...(filter === f.key ? {} : { color: "var(--text-2)" }) }}>
                {f.label} ({count})
              </button>
            );
          })}
        </div>
        {canManage && (hasContracts ? (
          <Link href="/ads/campaigns/new" style={{ ...solidBtn("var(--blue)"), textDecoration: "none" }} data-ads-new-campaign="">
            <Plus size={17} />קמפיין חדש
          </Link>
        ) : (
          <button type="button" onClick={onAdvertisers} style={ghostBtn} data-ads-need-contract="">
            קודם מוסיפים מפרסם וחוזה
          </button>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <div className="card" style={{ padding: "28px 20px", textAlign: "center" }} data-ads-empty="">
          <p style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)" }}>עוד אין קמפיינים</p>
          <p style={{ fontSize: "14.5px", color: "var(--text-2)", marginTop: "6px", lineHeight: 1.6 }}>
            קמפיין שייך לחוזה של מפרסם. מוסיפים מפרסם וחוזה, ואז קמפיין: תאריכים, ימים ושעות, יעד, מיקוד ופרסומת עם תמונה.
          </p>
        </div>
      ) : (
        <>
        <div className="ads-only-narrow" style={{ flexDirection: "column", gap: "10px" }} data-campaign-cards="">
          {shown.map((c) => (
            <Link key={c.id} href={`/ads/campaigns/${c.id}`} className="card" data-campaign-card={c.id}
              style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px", textDecoration: "none", color: "var(--text)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "15.5px" }}>{c.name}</div>
                  <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>{c.advertiser}, {fmtRange(c.starts_on, c.ends_on)}</div>
                </div>
                <Tag tone={c.tone as Tone}>{c.phase_label}</Tag>
              </div>
              {c.goal_views ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <Progress value={c.views} max={c.goal_views} label={`${c.name}: חשיפות מול היעד`}
                    color={c.pace_state === "behind" && c.phase === "running" ? TONE_COLOR.wait : "var(--blue)"} />
                  <span style={{ fontSize: "13px", color: c.pace_state === "behind" && c.phase === "running" ? "var(--yellow)" : "var(--text-2)" }}>
                    {fmtInt(c.views)} מתוך {fmtInt(c.goal_views)}{c.phase === "running" && c.pace_label ? `, ${c.pace_label}` : ""}
                  </span>
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                {statCell("חשיפות", fmtInt(c.views))}{statCell("הקלקות", fmtInt(c.clicks))}{statCell("CTR", fmtCtr(c.views, c.clicks))}
              </div>
            </Link>
          ))}
        </div>
        <div className="table-wrap ads-only-wide">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
            <thead>
              <tr>
                <th style={th}>קמפיין</th><th style={th}>מצב</th><th style={th}>תאריכים</th>
                <th style={th}>חשיפות</th><th style={th}>הקלקות</th><th style={th}>CTR</th><th style={th}>היום</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} data-campaign-row={c.id}>
                  <td style={td}>
                    <Link href={`/ads/campaigns/${c.id}`} style={{ color: "var(--text)", fontWeight: 700, textDecoration: "none" }}>{c.name}</Link>
                    <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>{c.advertiser}</div>
                  </td>
                  <td style={td}><Tag tone={c.tone as Tone}>{c.phase_label}</Tag></td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtRange(c.starts_on, c.ends_on)}</td>
                  <td style={{ ...td, minWidth: "170px" }}>
                    <div style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                      {fmtInt(c.views)}{c.goal_views ? <span style={{ color: "var(--text-2)", fontWeight: 400 }}> מתוך {fmtInt(c.goal_views)}</span> : null}
                    </div>
                    {c.goal_views ? (
                      <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <Progress value={c.views} max={c.goal_views} label={`${c.name}: חשיפות מול היעד`}
                          color={c.pace_state === "behind" && c.phase === "running" ? TONE_COLOR.wait : "var(--blue)"} />
                        {c.phase === "running" && c.pace_label && (
                          <span style={{ fontSize: "13px", color: c.pace_state === "behind" ? "var(--yellow)" : "var(--text-2)" }} data-pace={c.pace_state}>{c.pace_label}</span>
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--mono)" }}>{fmtInt(c.clicks)}</td>
                  <td style={{ ...td, fontFamily: "var(--mono)" }}>{fmtCtr(c.views, c.clicks)}</td>
                  <td style={{ ...td, fontFamily: "var(--mono)" }}>{fmtInt(c.today_views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ── מפרסמים וחוזים ────────────────────────────────────────────────────────────
function AdvertisersTab({ advertisers, canManage, onDone }: {
  advertisers: AdAdvertiserRow[]; canManage: boolean; onDone: (msg: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [editAdv, setEditAdv] = useState<AdAdvertiserRow | "new" | null>(null);
  const [editCon, setEditCon] = useState<{ adv: AdAdvertiserRow; con: AdContractRow | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const list = advertisers.filter((a) => showArchived || !a.archived_at);
  const archivedN = advertisers.filter((a) => a.archived_at).length;

  async function act(key: string, body: Record<string, unknown>, msg: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setErr(null);
    const r = await postAds(body);
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    onDone(msg);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
        {archivedN > 0 ? (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", fontSize: "14.5px", color: "var(--text-2)" }}>
            <input type="checkbox" checked={showArchived} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowArchived(e.target.checked)} style={{ width: "18px", height: "18px" }} />
            להציג גם מפרסמים בארכיון ({archivedN})
          </label>
        ) : <span />}
        {canManage && (
          <button type="button" onClick={() => setEditAdv("new")} style={solidBtn("var(--blue)")} data-ads-new-advertiser="">
            <Plus size={17} />מפרסם חדש
          </button>
        )}
      </div>
      {err && <Banner tone="error">{err}</Banner>}
      {list.length === 0 && (
        <div className="card" style={{ padding: "28px 20px", textAlign: "center" }} data-ads-no-advertisers="">
          <p style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)" }}>עוד אין מפרסמים</p>
          <p style={{ fontSize: "14.5px", color: "var(--text-2)", marginTop: "6px" }}>מפרסם הוא העסק שמשלם. לכל מפרסם — חוזה אחד או יותר, ולכל חוזה — קמפיינים.</p>
        </div>
      )}
      {list.map((a) => (
        <Section key={a.id} title={a.name} id={`adv-${a.id}`}
          hint={[a.legal_name, a.business_id ? `ח.פ ${ltr(a.business_id)}` : null, a.contact_name, a.contact_phone ? ltr(a.contact_phone) : null, a.contact_email ? ltr(a.contact_email) : null].filter(Boolean).join(", ") || undefined}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {a.archived_at && <Tag tone="muted">בארכיון</Tag>}
            {canManage && (
              <>
                <button type="button" style={ghostBtn} onClick={() => setEditAdv(a)} data-adv-edit={a.id}><Pencil size={15} />עריכה</button>
                {!a.archived_at && <button type="button" style={ghostBtn} onClick={() => setEditCon({ adv: a, con: null })} data-adv-new-contract={a.id}><Plus size={15} />חוזה חדש</button>}
                <button type="button" style={ghostBtn} disabled={busy === `arc-${a.id}`}
                  onClick={() => void act(`arc-${a.id}`, { action: "advertiser.archive", id: a.id, archived: !a.archived_at }, a.archived_at ? "המפרסם חזר מהארכיון." : "המפרסם הועבר לארכיון.")}>
                  {a.archived_at ? <><ArchiveRestore size={15} />החזרה מהארכיון</> : <><Archive size={15} />לארכיון</>}
                </button>
                {a.contracts.length === 0 && (
                  <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} disabled={busy === `del-${a.id}`}
                    onClick={() => void act(`del-${a.id}`, { action: "advertiser.delete", id: a.id }, "המפרסם נמחק.", `למחוק את ${a.name}?`)}>
                    <Trash2 size={15} />מחיקה
                  </button>
                )}
              </>
            )}
          </div>
          {a.contracts.length === 0 ? (
            <p style={{ fontSize: "14.5px", color: "var(--text-2)" }}>אין חוזים.</p>
          ) : (
            <>
            <div className="ads-only-narrow" style={{ flexDirection: "column", gap: "8px" }} data-contract-cards="">
              {a.contracts.map((k) => {
                const ended = k.ends_on < ilTodayKey();
                return (
                  <div key={k.id} style={{ padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "8px" }} data-contract-card={k.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{k.reference ? ltr(k.reference) : "בלי מספר"}</div>
                        <div style={{ fontSize: "13.5px", color: "var(--text-2)", marginTop: "2px" }}>
                          {fmtIls(k.price_ils)} {PRICING_LABEL[k.pricing]}, {fmtRange(k.starts_on, k.ends_on)}
                        </div>
                      </div>
                      <Tag tone={k.status === "active" ? (ended ? "muted" : "ok") : k.status === "cancelled" ? "danger" : "muted"}>
                        {k.status === "active" && ended ? "הסתיים" : CONTRACT_STATUS_LABEL[k.status]}
                      </Tag>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                      {statCell("חשיפות", fmtInt(k.views))}{statCell("הקלקות", fmtInt(k.clicks))}{statCell("שווי", fmtIls(k.value))}
                    </div>
                    {canManage && (
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button type="button" style={ghostBtn} onClick={() => setEditCon({ adv: a, con: k })}><Pencil size={15} />עריכה</button>
                        {k.document_url && <a href={k.document_url} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, textDecoration: "none" }}><FileText size={15} />המסמך</a>}
                        {k.campaigns === 0 && (
                          <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} disabled={busy === `kdel-${k.id}`}
                            onClick={() => void act(`kdel-${k.id}`, { action: "contract.delete", id: k.id }, "החוזה נמחק.", "למחוק את החוזה?")}>
                            <Trash2 size={15} />מחיקה
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="table-wrap ads-only-wide">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "720px" }}>
                <thead>
                  <tr><th style={th}>חוזה</th><th style={th}>תמחור</th><th style={th}>תקופה</th><th style={th}>מצב</th><th style={th}>נמסר</th><th style={th}>שווי</th><th style={th}></th></tr>
                </thead>
                <tbody>
                  {a.contracts.map((k) => {
                    const ended = k.ends_on < ilTodayKey();
                    return (
                      <tr key={k.id} data-contract-row={k.id}>
                        <td style={td}>
                          <div style={{ fontWeight: 700 }}>{k.reference ? ltr(k.reference) : "בלי מספר"}</div>
                          <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{k.campaigns === 1 ? "קמפיין אחד" : `${fmtInt(k.campaigns)} קמפיינים`}</div>
                        </td>
                        <td style={td}>
                          {fmtIls(k.price_ils)} <span style={{ color: "var(--text-2)" }}>{PRICING_LABEL[k.pricing]}</span>
                          {k.impression_cap ? <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>עד {fmtInt(k.impression_cap)} חשיפות</div> : null}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtRange(k.starts_on, k.ends_on)}</td>
                        <td style={td}>
                          <Tag tone={k.status === "active" ? (ended ? "muted" : "ok") : k.status === "cancelled" ? "danger" : "muted"}>
                            {k.status === "active" && ended ? "הסתיים" : CONTRACT_STATUS_LABEL[k.status]}
                          </Tag>
                        </td>
                        <td style={{ ...td, fontFamily: "var(--mono)" }}>
                          {fmtInt(k.views)} חשיפות
                          <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{fmtInt(k.clicks)} הקלקות</div>
                        </td>
                        <td style={{ ...td, fontFamily: "var(--mono)", fontWeight: 700 }}>{fmtIls(k.value)}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {k.document_url && (
                            <a href={k.document_url} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, textDecoration: "none" }} aria-label="מסמך החוזה"><FileText size={15} /></a>
                          )}
                          {canManage && (
                            <>
                              <button type="button" style={{ ...ghostBtn, marginInlineStart: "6px" }} onClick={() => setEditCon({ adv: a, con: k })} aria-label="עריכת החוזה" data-contract-edit={k.id}><Pencil size={15} /></button>
                              {k.campaigns === 0 && (
                                <button type="button" style={{ ...ghostBtn, marginInlineStart: "6px", color: "var(--red)" }} aria-label="מחיקת החוזה" disabled={busy === `kdel-${k.id}`}
                                  onClick={() => void act(`kdel-${k.id}`, { action: "contract.delete", id: k.id }, "החוזה נמחק.", "למחוק את החוזה?")}>
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Section>
      ))}
      {editAdv && <AdvertiserModal initial={editAdv === "new" ? null : editAdv} onClose={() => setEditAdv(null)} onSaved={(m) => { setEditAdv(null); onDone(m); }} />}
      {editCon && <ContractModal advertiser={{ id: editCon.adv.id, name: editCon.adv.name }} initial={editCon.con} onClose={() => setEditCon(null)} onSaved={(m) => { setEditCon(null); onDone(m); }} />}
    </div>
  );
}

// ── הגדרות ────────────────────────────────────────────────────────────────────
function SettingsTab({ settings, buildings, canManage, onDone, today }: {
  settings: AdSettingsView; buildings: AdBuildingOption[]; canManage: boolean; onDone: (msg: string) => void; today: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [emails, setEmails] = useState<string[]>(settings.testers.map((t) => t.email ?? "").filter(Boolean));
  const [newEmail, setNewEmail] = useState("");
  const [excluded, setExcluded] = useState<string[]>(settings.excluded_buildings);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const matches = q.trim().length >= 2
    ? buildings.filter((b) => !excluded.includes(b.id) && `${b.name} ${b.city ?? ""}`.includes(q.trim())).slice(0, 8) : [];

  async function save(key: string, body: Record<string, unknown>, msg: string) {
    setBusy(key); setErr(null);
    const r = await postAds({ action: "settings.save", ...body });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    onDone(msg);
  }

  const testersDirty = emails.join() !== settings.testers.map((t) => t.email ?? "").filter(Boolean).join();
  const excludedDirty = [...excluded].sort().join() !== [...settings.excluded_buildings].sort().join();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {err && <Banner tone="error">{err}</Banner>}
      <Section title="הפרסומות במערכת" hint="מתג אחד לכל הבניינים. כבוי — אף דייר לא רואה פרסומת, מיד, גם כשיש קמפיינים פעילים.">
        {canManage ? (
          <Toggle name="ads-enabled" checked={settings.enabled} label={settings.enabled ? "פועלות" : "כבויות"}
            hint={settings.updated_by ? `עודכן לאחרונה על ידי ${settings.updated_by}` : undefined}
            onChange={(v) => { if (busy) return; void save("enabled", { enabled: v }, v ? "הפרסומות הופעלו." : "הפרסומות כובו."); }} />
        ) : (
          <Tag tone={settings.enabled ? "ok" : "danger"}><Power size={13} />{settings.enabled ? "פועלות" : "כבויות"}</Tag>
        )}
      </Section>

      <Section title="הכללים הקבועים" hint="נאכפים בשרת של bloc בכל הצגה (החלטה 74). לא משתנים מכאן.">
        <ul style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6, paddingInlineStart: "18px", listStyle: "disc" }} data-ads-rules="">
          <li>פרסומת אחת ביום לכל משתמש לכל היותר, ולפחות 6 שעות בין שתיים.</li>
          <li>משתמש חדש — 3 ימים בלי פרסומות.</li>
          <li>רק במסך הבית, בלוח הקהילתי ובלוח האירועים. אף פעם בתשלום, בחירום, בכניסה, בהצטרפות או כשטופס פתוח.</li>
          <li>בניין עם הודעה דחופה (חירום) ב-24 השעות האחרונות — בלי פרסומות.</li>
          <li>מסומנות &quot;ממומן&quot; עם שם המפרסם. ה-X פעיל אחרי 3 שניות.</li>
          <li>ברירת המחדל: בניינים במסלול התנסות ו-Core. מסלול בתשלום גבוה יותר — רק כשהקמפיין בוחר בו.</li>
          <li>חברות ניהול וספקים — אף פעם.</li>
        </ul>
      </Section>

      <Section title="מכשירי בדיקה" hint="חשבונות bloc שרואים תצוגה מקדימה: הקמפיין שעודכן אחרון (טיוטה קודם), בלי מגבלות תדירות, תזמון ומיקוד — ושום דבר לא נספר. אפשר לשאול שוב אחרי דקה.">
        {emails.length === 0 && <p style={{ fontSize: "14.5px", color: "var(--text-2)" }}>אין מכשירי בדיקה.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} data-ads-testers="">
          {emails.map((e) => {
            const t = settings.testers.find((x) => x.email === e);
            return (
              <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 6px 6px 12px", borderRadius: "99px", border: "1px solid var(--border)", fontSize: "14px", color: "var(--text)" }}>
                <span dir="ltr">{e}</span>{t?.name ? <span style={{ color: "var(--text-2)" }}>{t.name}</span> : null}
                {canManage && (
                  <button type="button" aria-label={`הסרת ${e}`} onClick={() => setEmails(emails.filter((x) => x !== e))}
                    style={{ width: "44px", height: "44px", margin: "-8px -6px -8px -8px", borderRadius: "50%", border: "none", background: "transparent", color: "var(--text-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={15} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {canManage && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <input value={newEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)} type="email" dir="ltr"
              placeholder="email@example.com" style={{ ...inputStyle, maxWidth: "320px" }} data-ads-tester-input="" />
            <button type="button" style={ghostBtn} disabled={!/^\S+@\S+\.\S+$/.test(newEmail.trim()) || emails.length >= 20}
              onClick={() => { const e = newEmail.trim().toLowerCase(); if (!emails.includes(e)) setEmails([...emails, e]); setNewEmail(""); }}>
              <Plus size={15} />הוספה
            </button>
            <button type="button" style={{ ...solidBtn("var(--blue)"), opacity: testersDirty ? 1 : 0.6 }} disabled={!testersDirty || busy === "testers"}
              onClick={() => void save("testers", { tester_emails: emails }, "מכשירי הבדיקה נשמרו.")} data-ads-save-testers="">
              {busy === "testers" ? "שומרים…" : "שמירת הרשימה"}
            </button>
          </div>
        )}
      </Section>

      <Section title="בניינים בלי פרסומות" hint="לא מקבלים פרסומות בכלל, גם כשקמפיין מכוון אליהם (בניין תדמית, פיילוט, בקשה מיוחדת).">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }} data-ads-excluded="">
          {excluded.length === 0 && <span style={{ fontSize: "14.5px", color: "var(--text-2)" }}>אין.</span>}
          {excluded.map((id) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 6px 6px 12px", borderRadius: "99px", border: "1px solid var(--border)", fontSize: "14px" }}>
              {byId.get(id)?.name ?? "בניין שנמחק"}
              {canManage && (
                <button type="button" aria-label="הסרה מהרשימה" onClick={() => setExcluded(excluded.filter((x) => x !== id))}
                  style={{ width: "44px", height: "44px", margin: "-8px -6px -8px -8px", borderRadius: "50%", border: "none", background: "transparent", color: "var(--text-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={15} />
                </button>
              )}
            </span>
          ))}
        </div>
        {canManage && (
          <>
            <div style={{ position: "relative", maxWidth: "360px" }}>
              <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
              <input value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="חיפוש בניין לפי שם או עיר"
                style={{ ...inputStyle, paddingRight: "36px" }} data-ads-building-search="" />
            </div>
            {matches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: "360px" }}>
                {matches.map((b) => (
                  <button key={b.id} type="button" onClick={() => { setExcluded([...excluded, b.id]); setQ(""); }}
                    style={{ ...ghostBtn, justifyContent: "flex-start" }}>{b.name}{b.city ? <span style={{ color: "var(--text-2)" }}> {b.city}</span> : null}</button>
                ))}
              </div>
            )}
            <div>
              <button type="button" style={{ ...solidBtn("var(--blue)"), opacity: excludedDirty ? 1 : 0.6 }} disabled={!excludedDirty || busy === "excluded"}
                onClick={() => void save("excluded", { excluded_buildings: excluded }, "רשימת הבניינים נשמרה.")} data-ads-save-excluded="">
                {busy === "excluded" ? "שומרים…" : "שמירת הרשימה"}
              </button>
            </div>
          </>
        )}
      </Section>
      <p style={{ fontSize: "13px", color: "var(--text-3)" }}>נכון ל-{today.split("-").reverse().join(".")}, לפי שעון ישראל.</p>
    </div>
  );
}
