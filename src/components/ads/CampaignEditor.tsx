"use client";
// CampaignEditor — קמפיין (bloc ADS-1; החלטות 74–75): לאיזה חוזה, מתי (תאריכים, ימים, שעות — שעון ישראל),
// כמה (יעד בפריסה אחידה, תקרה ליום, תקרה לאדם), למי (מסכים, מסלולים, קהל, ערים, בניינים), ומשקל. ומתחת —
// הפרסומות של הקמפיין והדוח. קמפיין חדש נשמר כטיוטה; מפעילים כשיש חוזה פעיל ופרסומת עם תמונה.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Pause, Square, Copy, Trash2, Search, X, ArrowRight } from "lucide-react";
import { Section, Banner, Tag, solidBtn, ghostBtn, inputStyle } from "@/components/ui/panelKit";
import { postAds, ChipSet, Field, Progress, intOrNull } from "./adsKit";
import CreativeManager from "./CreativeManager";
import {
  SCREENS, SCREEN_LABEL, AD_PLANS, PLAN_LABEL, AD_ROLES, ROLE_LABEL, DAY_NAME, PRICING_LABEL, DEFAULT_PLANS,
  fmtInt, fmtIls, fmtCtr, fmtRange, fmtDays, fmtHours, addDaysKey, contractValue, audienceSummary, screensWarning, liveNow,
  type AdPlan, type AdRole, type AdScreen, type Tone,
} from "@/lib/ads";
import type { AdCampaignRow, AdCreativeRow, AdBuildingOption, CampaignPageData } from "@/lib/adsServer";

const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px" };
const HOURS = Array.from({ length: 25 }, (_, i) => i);

export default function CampaignEditor({ today, campaign, creatives, contracts, buildings, cities, canManage, creativeServes }: {
  today: string;
  campaign: AdCampaignRow | null;
  creatives: AdCreativeRow[];
  contracts: CampaignPageData["contracts"];
  buildings: AdBuildingOption[];
  cities: string[];
  canManage: boolean;
  /** כמה הגשות לכל פרסומת (מהדוח) — פרסומת שהוצגה נעולה לתוכן. */
  creativeServes: Record<string, number>;
}) {
  const router = useRouter();
  const usable = contracts.filter((k) => k.status !== "cancelled" && k.ends_on >= today);
  const [f, setF] = useState({
    name: campaign?.name ?? "",
    contract_id: campaign?.contract_id ?? (usable[0]?.id ?? ""),
    starts_on: campaign?.starts_on ?? today,
    ends_on: campaign?.ends_on ?? addDaysKey(today, 29),
    days: campaign?.days ?? [0, 1, 2, 3, 4, 5, 6],
    hour_from: campaign?.hour_from ?? 8,
    hour_to: campaign?.hour_to ?? 22,
    screens: (campaign?.screens ?? [...SCREENS]) as AdScreen[],
    plans: (campaign?.plans ?? DEFAULT_PLANS) as AdPlan[],
    roles: (campaign?.roles ?? [...AD_ROLES]) as AdRole[],
    cities: campaign?.cities ?? [],
    building_ids: campaign?.building_ids ?? [],
    goal: campaign?.goal_views != null ? String(campaign.goal_views) : "",
    daily: campaign?.daily_cap != null ? String(campaign.daily_cap) : "",
    per_user: campaign?.per_user_cap ?? 3,
    weight: campaign?.weight ?? 1,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cityQ, setCityQ] = useState("");
  const [bq, setBq] = useState("");
  const byId = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const contract = contracts.find((k) => k.id === f.contract_id) ?? null;
  const locked = !canManage || campaign?.status === "ended";
  const served = (campaign?.serves ?? 0) > 0;

  const cityMatches = cityQ.trim() ? cities.filter((c) => !f.cities.includes(c) && c.includes(cityQ.trim())).slice(0, 8) : [];
  const bMatches = bq.trim().length >= 2
    ? buildings.filter((b) => !f.building_ids.includes(b.id) && `${b.name} ${b.city ?? ""}`.includes(bq.trim())).slice(0, 8) : [];
  const inTarget = (f.cities.length || f.building_ids.length)
    ? buildings.filter((b) => (!f.cities.length || (b.city && f.cities.some((c) => c.trim().toLowerCase() === b.city!.trim().toLowerCase())))
        && (!f.building_ids.length || f.building_ids.includes(b.id))).length
    : null;

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy("save"); setErr(null); setNotice(null);
    const r = await postAds<{ id: string }>({
      action: "campaign.save", ...(campaign ? { id: campaign.id } : {}),
      contract_id: f.contract_id, name: f.name, starts_on: f.starts_on, ends_on: f.ends_on,
      days: f.days, hour_from: f.hour_from, hour_to: f.hour_to, screens: f.screens, plans: f.plans, roles: f.roles,
      cities: f.cities, building_ids: f.building_ids, goal_views: intOrNull(f.goal), daily_cap: intOrNull(f.daily),
      per_user_cap: f.per_user, weight: f.weight,
    });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    if (!campaign) { router.replace(`/ads/campaigns/${r.data.id}?created=1`); return; }
    setNotice("הקמפיין נשמר.");
    router.refresh();
  }

  async function status(next: "active" | "paused" | "ended", confirmText?: string) {
    if (!campaign) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(next); setErr(null); setNotice(null);
    const r = await postAds({ action: "campaign.status", id: campaign.id, status: next });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    setNotice(next === "active" ? "הקמפיין הופעל." : next === "paused" ? "הקמפיין הושהה." : "הקמפיין הסתיים.");
    router.refresh();
  }
  async function duplicate() {
    if (!campaign) return;
    setBusy("dup"); setErr(null);
    const r = await postAds<{ id: string }>({ action: "campaign.duplicate", id: campaign.id });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    router.push(`/ads/campaigns/${r.data.id}?copied=1`);
  }
  async function remove() {
    if (!campaign || !window.confirm(`למחוק את "${campaign.name}"? הקמפיין עוד לא הוצג, ולכן הוא נמחק לגמרי.`)) return;
    setBusy("del"); setErr(null);
    const r = await postAds({ action: "campaign.delete", id: campaign.id });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    router.replace("/ads");
  }

  const canActivate = campaign && (campaign.status === "draft" || campaign.status === "paused");
  const value = campaign && contract ? contractValue(contract.pricing, contract.price_ils, { views: campaign.views, clicks: campaign.clicks }) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Link href="/ads" style={{ ...ghostBtn, alignSelf: "flex-start", textDecoration: "none" }}><ArrowRight size={16} />לכל הקמפיינים</Link>

      {campaign && (
        <div className="card" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }} data-campaign-summary="">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <Tag tone={campaign.tone as Tone}>{campaign.phase_label}</Tag>
            <span style={{ fontSize: "14.5px", color: "var(--text-2)" }}>{campaign.advertiser}{campaign.contract_ref ? <> (<bdi>{campaign.contract_ref}</bdi>)</> : null}</span>
          </div>
          <p style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }} data-campaign-audience="">{audienceSummary(campaign)}</p>
          {campaign.phase === "running" && (() => {
            const ln = liveNow(campaign);
            return (
              <p style={{ fontSize: "14.5px", fontWeight: 600, color: ln.live ? "var(--green)" : "var(--yellow)", lineHeight: 1.6 }} data-campaign-live={ln.live ? "on" : "off"}>
                {ln.live ? "רץ עכשיו." : `לא רץ עכשיו: ${ln.reason}`}
              </p>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "10px" }}>
            {[
              { label: "חשיפות", value: fmtInt(campaign.views) },
              { label: "הקלקות", value: fmtInt(campaign.clicks) },
              { label: "CTR", value: fmtCtr(campaign.views, campaign.clicks) },
              { label: "היום", value: fmtInt(campaign.today_views) },
              ...(value !== null && contract ? [{ label: `שווי (${PRICING_LABEL[contract.pricing]})`, value: fmtIls(value) }] : []),
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{s.label}</div>
                <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--mono)", marginTop: "4px" }}>{s.value}</div>
              </div>
            ))}
          </div>
          {campaign.goal_views ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Progress value={campaign.views} max={campaign.goal_views} label="חשיפות מול היעד" />
              <span style={{ fontSize: "13.5px", color: campaign.pace_state === "behind" ? "var(--yellow)" : "var(--text-2)" }} data-pace={campaign.pace_state}>
                {fmtInt(campaign.views)} מתוך {fmtInt(campaign.goal_views)}
                {campaign.phase === "running" && campaign.pace_label ? `, ${campaign.pace_label} (צפוי עד עכשיו ${fmtInt(campaign.pace_expected)})` : ""}
              </span>
            </div>
          ) : null}
          {canManage && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {canActivate && (
                <button type="button" style={{ ...solidBtn("#16a34a"), opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={() => void status("active")} data-campaign-action="activate">
                  <Play size={16} />{campaign.status === "draft" ? "הפעלה" : "המשך"}
                </button>
              )}
              {campaign.status === "active" && (
                <button type="button" style={ghostBtn} disabled={!!busy} onClick={() => void status("paused")} data-campaign-action="pause"><Pause size={15} />השהיה</button>
              )}
              {campaign.status !== "ended" && campaign.status !== "draft" && (
                <button type="button" style={ghostBtn} disabled={!!busy} onClick={() => void status("ended", "לסיים את הקמפיין? קמפיין שהסתיים לא חוזר לפעול (אפשר לשכפל אותו).")} data-campaign-action="end">
                  <Square size={15} />סיום
                </button>
              )}
              <button type="button" style={ghostBtn} disabled={!!busy} onClick={() => void duplicate()} data-campaign-action="duplicate"><Copy size={15} />שכפול</button>
              {!served && (
                <button type="button" style={{ ...ghostBtn, color: "var(--red)" }} disabled={!!busy} onClick={() => void remove()} data-campaign-action="delete"><Trash2 size={15} />מחיקה</button>
              )}
              <Link href={`/ads/campaigns/${campaign.id}/report`} style={{ ...ghostBtn, textDecoration: "none" }} data-campaign-report="">דוח למפרסם</Link>
            </div>
          )}
        </div>
      )}

      {notice && <Banner tone="ok"><span data-campaign-notice="">{notice}</span></Banner>}
      {err && <Banner tone="error"><span data-campaign-error="">{err}</span></Banner>}
      {campaign?.status === "ended" && <Banner tone="info">הקמפיין הסתיים, ולכן הוא לקריאה בלבד. לקמפיין דומה — שכפול.</Banner>}

      <fieldset disabled={locked || !!busy} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
        <Section title="פרטים" hint="השם פנימי בלבד. הדיירים רואים את שם המפרסם, מתוך החוזה.">
          <div style={grid}>
            <Field label="שם הקמפיין">
              <input value={f.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("name", e.target.value)} maxLength={80} style={inputStyle} data-campaign-field="name" />
            </Field>
            <Field label="חוזה" hint={contract ? `${fmtIls(contract.price_ils)} ${PRICING_LABEL[contract.pricing]}, ${fmtRange(contract.starts_on, contract.ends_on)}` : undefined}>
              <select value={f.contract_id} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("contract_id", e.target.value)} style={inputStyle}
                disabled={served} data-campaign-field="contract">
                {!f.contract_id && <option value="">בחרו חוזה</option>}
                {contracts.filter((k) => k.id === f.contract_id || (k.status !== "cancelled" && k.ends_on >= today)).map((k) => (
                  <option key={k.id} value={k.id}>{k.label}{k.status === "draft" ? " (טיוטה)" : ""}</option>
                ))}
              </select>
            </Field>
          </div>
          {contract?.status === "draft" && <Banner tone="warn">החוזה עדיין טיוטה. הקמפיין יוצג רק אחרי שהחוזה יסומן כפעיל.</Banner>}
        </Section>

        <Section title="מתי" hint={`לפי שעון ישראל. ${fmtDays(f.days)}, ${fmtHours(f.hour_from, f.hour_to)}.`}>
          <div style={grid}>
            <Field label="מתאריך"><input type="date" className="input" value={f.starts_on} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("starts_on", e.target.value)} data-campaign-field="starts_on" /></Field>
            <Field label="עד תאריך (כולל)"><input type="date" className="input" value={f.ends_on} min={f.starts_on} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("ends_on", e.target.value)} data-campaign-field="ends_on" /></Field>
            <Field label="משעה">
              <select value={f.hour_from} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("hour_from", Number(e.target.value))} style={inputStyle} data-campaign-field="hour_from">
                {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </Field>
            <Field label="עד שעה">
              <select value={f.hour_to} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("hour_to", Number(e.target.value))} style={inputStyle} data-campaign-field="hour_to">
                {HOURS.slice(1).map((h) => <option key={h} value={h} disabled={h <= f.hour_from}>{h === 24 ? "24:00 (סוף היום)" : `${String(h).padStart(2, "0")}:00`}</option>)}
              </select>
            </Field>
          </div>
          <ChipSet name="days" label="ימים" value={f.days} onChange={(v) => set("days", v)} allLabel="כל הימים"
            options={DAY_NAME.map((d, i) => ({ key: i, label: d }))} />
        </Section>

        <Section title="כמה" hint="יעד — הקמפיין מתפרס באופן אחיד עד הסוף (לא נגמר ביום הראשון). חשיפה = פרסומת שהוצגה על המסך.">
          <div style={grid}>
            <Field label="יעד חשיפות לכל הקמפיין" hint="ריק — בלי יעד (בלי פריסה)">
              <input value={f.goal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("goal", e.target.value)} inputMode="numeric" style={inputStyle} dir="ltr" data-campaign-field="goal" />
            </Field>
            <Field label="תקרה ליום" hint="ריק — בלי תקרה ליום">
              <input value={f.daily} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("daily", e.target.value)} inputMode="numeric" style={inputStyle} dir="ltr" data-campaign-field="daily" />
            </Field>
            <Field label="לכל אדם, לכל הקמפיין" hint="כמה פעמים לכל היותר אותו אדם יראה את הקמפיין">
              <select value={f.per_user} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("per_user", Number(e.target.value))} style={inputStyle} data-campaign-field="per_user">
                {[1, 2, 3, 4, 5, 7, 10, 15, 20, 30].map((v) => <option key={v} value={v}>{v === 1 ? "פעם אחת" : `${v} פעמים`}</option>)}
              </select>
            </Field>
            <Field label="משקל מול קמפיינים אחרים" hint="כשכמה קמפיינים מתאימים לאותו רגע. קמפיין שמפגר אחרי היעד שלו — תמיד קודם.">
              <select value={f.weight} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set("weight", Number(e.target.value))} style={inputStyle} data-campaign-field="weight">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v === 1 ? "1 (רגיל)" : String(v)}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="למי" hint="רק דיירים וועד בבניין. חברות ניהול וספקים — אף פעם.">
          <p style={{ fontSize: "14.5px", color: "var(--text)", lineHeight: 1.6 }} data-campaign-audience-edit="">{audienceSummary(f)}</p>
          <ChipSet name="screens" label="באילו מסכים" value={f.screens} onChange={(v) => set("screens", v)} allLabel="כל המסכים"
            options={SCREENS.map((s) => ({ key: s, label: SCREEN_LABEL[s] }))} />
          {screensWarning(f.screens) && <Banner tone="warn"><span data-campaign-screens-warning="">{screensWarning(f.screens)}</span></Banner>}
          <ChipSet name="plans" label="מסלולים" value={f.plans} onChange={(v) => set("plans", v)} allLabel="כל המסלולים"
            options={AD_PLANS.map((p) => ({ key: p, label: PLAN_LABEL[p] }))}
            hint="ברירת המחדל: התנסות ו-Core. מסלול בתשלום גבוה יותר מקבל פרסומות רק כשמסמנים אותו כאן. בניין שחברת ניהול מנהלת נחשב Pro." />
          <ChipSet name="roles" label="קהל" value={f.roles} onChange={(v) => set("roles", v)} allLabel="כולם"
            options={AD_ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] }))} />

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-campaign-cities="">
            <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>ערים {f.cities.length ? "" : "(כל הערים)"}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {f.cities.map((c) => (
                <span key={c} style={pill}>{c}
                  <button type="button" aria-label={`הסרת ${c}`} style={pillX} onClick={() => set("cities", f.cities.filter((x) => x !== c))}><X size={14} /></button>
                </span>
              ))}
            </div>
            <div style={{ position: "relative", maxWidth: "360px" }}>
              <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
              <input value={cityQ} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCityQ(e.target.value)} placeholder="הוספת עיר" style={{ ...inputStyle, paddingRight: "36px" }} data-campaign-city-search="" />
            </div>
            {cityMatches.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {cityMatches.map((c) => <button key={c} type="button" style={ghostBtn} onClick={() => { set("cities", [...f.cities, c]); setCityQ(""); }}>{c}</button>)}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }} data-campaign-buildings="">
            <span style={{ fontSize: "13.5px", color: "var(--text-2)" }}>בניינים מסוימים {f.building_ids.length ? "" : "(כל הבניינים)"}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {f.building_ids.map((id) => (
                <span key={id} style={pill}>{byId.get(id)?.name ?? "בניין שנמחק"}
                  <button type="button" aria-label="הסרה" style={pillX} onClick={() => set("building_ids", f.building_ids.filter((x) => x !== id))}><X size={14} /></button>
                </span>
              ))}
            </div>
            <div style={{ position: "relative", maxWidth: "360px" }}>
              <Search size={16} style={{ position: "absolute", right: "12px", top: "16px", color: "var(--text-3)" }} />
              <input value={bq} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBq(e.target.value)} placeholder="חיפוש בניין לפי שם או עיר" style={{ ...inputStyle, paddingRight: "36px" }} data-campaign-building-search="" />
            </div>
            {bMatches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxWidth: "360px" }}>
                {bMatches.map((b) => (
                  <button key={b.id} type="button" style={{ ...ghostBtn, justifyContent: "flex-start" }} onClick={() => { set("building_ids", [...f.building_ids, b.id]); setBq(""); }}>
                    {b.name}{b.city ? <span style={{ color: "var(--text-2)" }}> {b.city}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          {inTarget !== null && (
            <p style={{ fontSize: "14px", color: inTarget === 0 ? "var(--yellow)" : "var(--text-2)" }} data-campaign-reach="">
              {inTarget === 0 ? "אין בניין שמתאים גם לערים וגם לבניינים שנבחרו." : `${fmtInt(inTarget)} בניינים בערים ובבניינים שנבחרו (לפני סינון לפי מסלול).`}
            </p>
          )}
        </Section>
      </fieldset>

      {canManage && campaign?.status !== "ended" && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void save()} disabled={!!busy || f.name.trim().length < 2 || !f.contract_id}
            style={{ ...solidBtn("var(--blue)"), opacity: busy || f.name.trim().length < 2 || !f.contract_id ? 0.6 : 1 }} data-campaign-save="">
            {busy === "save" ? "שומרים…" : campaign ? "שמירת השינויים" : "שמירה כטיוטה"}
          </button>
          {!campaign && <span style={{ fontSize: "14px", color: "var(--text-2)", alignSelf: "center" }}>אחרי השמירה מוסיפים פרסומת עם תמונה, ואז מפעילים.</span>}
        </div>
      )}

      {campaign && (
        <CreativeManager campaignId={campaign.id} advertiser={campaign.advertiser} creatives={creatives}
          creativeServes={creativeServes} canManage={canManage && campaign.status !== "ended"} />
      )}
    </div>
  );
}

const pill: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 4px 4px 12px", borderRadius: "99px", border: "1px solid var(--border)", fontSize: "14px", color: "var(--text)" };
const pillX: React.CSSProperties = { width: "44px", height: "44px", margin: "-8px -6px -8px -8px", borderRadius: "50%", border: "none", background: "transparent", color: "var(--text-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" };
