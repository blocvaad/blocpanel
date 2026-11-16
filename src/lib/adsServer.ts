// src/lib/adsServer.ts — טעינת הנתונים לעמודי הפרסומות (bloc ADS-1; ADS-2א v2 — סטודיו הפרסום). צד שרת בלבד (service role);
// העמוד עצמו עובר requirePageSession קודם. SQL 175 שעוד לא רץ — "missing", לא רשימות ריקות. קריאות בלבד (עד א3).
// ADS-2א v2: הפורמט שייך למודעה — קמפיין מופיע בכל מקום שהמודעות הפעילות שלו מתאימות לו (placements / slots). הטבלאות נקראות
// ב-"*": העמודות של SQL 228 (format, theme, accent, focal, frames, logo_url, brand_color) עוד לא קיימות לפניו — עמודה חסרה ברשימה
// הייתה שוברת את כל המסך. למסך הבית — לכל קמפיין לא-טיוטה מ-30 הימים האחרונים, הימים מ-ad_report (קו קטן, טווח 7 / 30 יום);
// קריאה שנכשלה — null (לא אפסים).
import { adminClient } from "./supabase";
import { fetchAll } from "./fetchAll";
import {
  adsSqlMissing, campaignPhase, pacing, contractValue, ilTodayKey, addDaysKey, parseReport,
  type AdPlan, type AdRole, type AdScreen, type CampaignStatus, type ContractStatus, type Pricing, type Tone,
  type CampaignPhase,
} from "./ads";
import {
  AD_FORMATS, parseFormat, parseBannerPosition, parseTheme, parseFrames, parseFocal, parseHex, allImagesOurs, slotsOf,
  type AdFormat, type AdFrame, type AdSlot, type AdTheme, type BannerPosition,
} from "./adsFormats";
import { adsImageBase } from "./adsUi";

type Row = Record<string, any>;

export interface AdContractRow {
  id: string; advertiser_id: string; reference: string | null; pricing: Pricing; price_ils: number;
  impression_cap: number | null; starts_on: string; ends_on: string; status: ContractStatus;
  document_url: string | null; notes: string | null;
  campaigns: number; views: number; clicks: number; value: number;
}
export interface AdAdvertiserRow {
  id: string; name: string; legal_name: string | null; business_id: string | null; contact_name: string | null;
  contact_phone: string | null; contact_email: string | null; website: string | null; notes: string | null;
  archived_at: string | null; contracts: AdContractRow[];
  /** ADS-2א v2 (SQL 228): הלוגו (רק מהבאקט של bloc) וצבע המותג; לפני 228 — null. */
  logo_url: string | null; brand_color: string | null;
}
export interface AdCampaignRow {
  id: string; name: string; status: CampaignStatus; starts_on: string; ends_on: string;
  days: number[]; hour_from: number; hour_to: number; screens: AdScreen[]; plans: AdPlan[]; roles: AdRole[];
  cities: string[]; building_ids: string[]; goal_views: number | null; daily_cap: number | null; per_user_cap: number; weight: number;
  contract_id: string; advertiser: string; advertiser_id: string; contract_ref: string | null;
  serves: number; views: number; clicks: number; closes: number; today_views: number; today_clicks: number;
  creatives_active: number; creatives_total: number;
  /** ADS-2א v2: מודעות פעילות שכל התמונות שלהן מהבאקט של bloc — רק הן מוגשות. */
  creatives_ready: number;
  /** הפורמטים של המודעות הפעילות (בסדר הקבוע) והמקומות במסך שלהם. */
  placements: AdFormat[]; slots: AdSlot[];
  advertiser_logo: string | null; advertiser_color: string | null;
  phase: CampaignPhase; phase_label: string; tone: Tone; pace_state: string; pace_label: string; pace_expected: number;
}
export interface AdSettingsView {
  enabled: boolean; excluded_buildings: string[];
  testers: Array<{ id: string; email: string | null; name: string | null }>;
  updated_at: string | null; updated_by: string | null;
}
export interface AdBuildingOption { id: string; name: string; city: string | null }
export interface AdCreativeRow {
  id: string; campaign_id: string; image_url: string; image_alt: string; headline: string; body: string | null;
  cta_label: string; cta_url: string; active: boolean; created_at: string;
  /** ADS-2א v2 (SQL 228): לפני 228 — card / null / light / null / 0.5 / null. */
  format: AdFormat; banner_position: BannerPosition | null; theme: AdTheme; accent: string | null;
  focal_x: number; focal_y: number; frames: AdFrame[] | null;
}

export type AdsOverview =
  | { state: "missing" }
  | { state: "error" }
  | {
    state: "ok"; today: string; settings: AdSettingsView; advertisers: AdAdvertiserRow[]; campaigns: AdCampaignRow[];
    buildings: AdBuildingOption[]; creatives: AdCreativeRow[];
  };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** שורת ad_creatives (לפני / אחרי SQL 228) → מודעה בדוקה. */
export function creativeRow(r: Row): AdCreativeRow {
  const format = parseFormat(r.format);
  return {
    id: String(r.id), campaign_id: String(r.campaign_id), image_url: String(r.image_url ?? ""), image_alt: String(r.image_alt ?? ""),
    headline: String(r.headline ?? ""), body: strOrNull(r.body), cta_label: String(r.cta_label ?? ""), cta_url: String(r.cta_url ?? ""),
    active: r.active === true, created_at: String(r.created_at ?? ""),
    format, banner_position: format === "banner" ? parseBannerPosition(r.banner_position) : null, theme: parseTheme(r.theme),
    accent: parseHex(r.accent), focal_x: parseFocal(r.focal_x), focal_y: parseFocal(r.focal_y), frames: parseFrames(r.frames),
  };
}

export async function loadBuildingsForAds(): Promise<{ rows: AdBuildingOption[]; error: boolean }> {
  const res = await fetchAll<{ id: string; name: string | null; city: string | null }>((from, to) =>
    adminClient.from("buildings").select("id, name, city").not("is_archived", "is", true)
      .order("name", { ascending: true }).order("id", { ascending: true }).range(from, to) as any);
  return {
    rows: res.rows.map((b) => ({ id: b.id, name: (b.name ?? "").trim() || "בניין ללא שם", city: (b.city ?? "").trim() || null })),
    error: res.error,
  };
}

export async function loadAdsOverview(): Promise<AdsOverview> {
  const [set, adv, con, cam, cre, tot] = await Promise.all([
    adminClient.from("ad_settings").select("*").eq("id", 1).maybeSingle(),
    adminClient.from("ad_advertisers").select("*").order("name", { ascending: true }),
    adminClient.from("ad_contracts").select("*").order("starts_on", { ascending: false }),
    adminClient.from("ad_campaigns").select("*").order("updated_at", { ascending: false }),
    adminClient.from("ad_creatives").select("*").order("created_at", { ascending: true }),
    adminClient.rpc("ad_totals"),
  ]);
  const errs = [set.error, adv.error, con.error, cam.error, cre.error, tot.error].filter(Boolean);
  if (errs.some((e) => adsSqlMissing(e as any))) return { state: "missing" };
  if (errs.length || !set.data) { if (errs.length) console.error("[ads overview]", errs[0]); return errs.length ? { state: "error" } : { state: "missing" }; }

  const today = ilTodayKey();
  const imageBase = adsImageBase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const totals = new Map<string, Row>(((tot.data ?? []) as Row[]).map((t) => [String(t.campaign_id), t]));
  const creatives = ((cre.data ?? []) as Row[]).map(creativeRow);
  const contracts = (con.data ?? []) as Row[];
  const contractById = new Map(contracts.map((k) => [String(k.id), k]));
  const advertisers = (adv.data ?? []) as Row[];
  const advById = new Map(advertisers.map((a) => [String(a.id), a]));

  const campaigns: AdCampaignRow[] = ((cam.data ?? []) as Row[]).map((c) => {
    const t = totals.get(String(c.id)) ?? {};
    const k = contractById.get(String(c.contract_id));
    const a = k ? advById.get(String(k.advertiser_id)) : undefined;
    const views = n(t.views);
    const ph = campaignPhase(c as any, k as any, views, today);
    const pc = pacing(c as any, views);
    const mine = creatives.filter((r) => r.campaign_id === String(c.id));
    const active = mine.filter((r) => r.active);
    const ready = active.filter((r) => allImagesOurs(r.image_url, r.frames, imageBase));
    const placements = AD_FORMATS.filter((f) => active.some((r) => r.format === f));
    return {
      id: c.id, name: c.name, status: c.status, starts_on: c.starts_on, ends_on: c.ends_on,
      days: c.days ?? [], hour_from: n(c.hour_from), hour_to: n(c.hour_to), screens: c.screens ?? [], plans: c.plans ?? [],
      roles: c.roles ?? [], cities: c.cities ?? [], building_ids: c.building_ids ?? [], goal_views: c.goal_views ?? null,
      daily_cap: c.daily_cap ?? null, per_user_cap: n(c.per_user_cap), weight: n(c.weight),
      contract_id: c.contract_id, advertiser_id: k ? String(k.advertiser_id) : "", advertiser: a ? String(a.name) : "",
      contract_ref: k?.reference ?? null,
      serves: n(t.serves), views, clicks: n(t.clicks), closes: n(t.closes), today_views: n(t.today_views), today_clicks: n(t.today_clicks),
      creatives_active: active.length, creatives_total: mine.length, creatives_ready: ready.length,
      placements, slots: slotsOf(placements),
      advertiser_logo: a ? strOrNull(a.logo_url) : null, advertiser_color: a ? parseHex(a.brand_color) : null,
      phase: ph.phase, phase_label: ph.label, tone: ph.tone, pace_state: pc.state, pace_label: pc.label, pace_expected: pc.expected,
    };
  });

  const byContract = new Map<string, AdCampaignRow[]>();
  for (const c of campaigns) byContract.set(c.contract_id, [...(byContract.get(c.contract_id) ?? []), c]);
  const advRows: AdAdvertiserRow[] = advertisers.map((a) => ({
    id: a.id, name: a.name, legal_name: a.legal_name ?? null, business_id: a.business_id ?? null,
    contact_name: a.contact_name ?? null, contact_phone: a.contact_phone ?? null, contact_email: a.contact_email ?? null,
    website: a.website ?? null, notes: a.notes ?? null, archived_at: a.archived_at ?? null,
    logo_url: strOrNull(a.logo_url), brand_color: parseHex(a.brand_color),
    contracts: contracts.filter((k) => k.advertiser_id === a.id).map((k) => {
      const cs = byContract.get(String(k.id)) ?? [];
      const views = cs.reduce((s, c) => s + c.views, 0);
      const clicks = cs.reduce((s, c) => s + c.clicks, 0);
      return {
        id: k.id, advertiser_id: k.advertiser_id, reference: k.reference ?? null, pricing: k.pricing, price_ils: n(k.price_ils),
        impression_cap: k.impression_cap ?? null, starts_on: k.starts_on, ends_on: k.ends_on, status: k.status,
        document_url: k.document_url ?? null, notes: k.notes ?? null,
        campaigns: cs.length, views, clicks, value: contractValue(k.pricing, n(k.price_ils), { views, clicks }),
      };
    }),
  }));

  const s = set.data as Row;
  const testerIds: string[] = s.testers ?? [];
  let testers: AdSettingsView["testers"] = testerIds.map((id) => ({ id, email: null, name: null }));
  if (testerIds.length) {
    const p = await adminClient.from("profiles").select("id, email, full_name").in("id", testerIds);
    if (!p.error) {
      const m = new Map(((p.data ?? []) as Row[]).map((r) => [String(r.id), r]));
      testers = testerIds.map((id) => ({ id, email: m.get(id)?.email ?? null, name: m.get(id)?.full_name ?? null }));
    }
  }
  const b = await loadBuildingsForAds();

  return {
    state: "ok", today,
    settings: { enabled: !!s.enabled, excluded_buildings: s.excluded_buildings ?? [], testers, updated_at: s.updated_at ?? null, updated_by: s.updated_by ?? null },
    advertisers: advRows, campaigns, buildings: b.rows, creatives,
  };
}

// ── מסך הבית של הסטודיו: הימים של כל קמפיין (מ-ad_report), לטווח ולקו הקטן ──

export interface CampaignDaily { days: Array<{ day: string; views: number; clicks: number }>; reach: number; frozenAt: string | null }
/** כמה קמפיינים לכל היותר נקראים לטווח (הקמפיינים האחרונים שעודכנו). */
export const STUDIO_DAILY_MAX = 60;

/** לכל קמפיין לא-טיוטה שלא הסתיים לפני יותר מ-30 יום: הימים, האנשים השונים ומתי נשמרו. נכשל — null (לא אפסים). */
export async function loadStudioDaily(campaigns: AdCampaignRow[], today: string): Promise<Record<string, CampaignDaily | null>> {
  const since = addDaysKey(today, -30);
  const pick = campaigns.filter((c) => c.status !== "draft" && c.ends_on >= since).slice(0, STUDIO_DAILY_MAX);
  const out: Record<string, CampaignDaily | null> = {};
  await Promise.all(pick.map(async (c) => {
    try {
      const r = await adminClient.rpc("ad_report", { p_campaign: c.id });
      if (r.error) { out[c.id] = null; return; }
      const rep = parseReport(r.data);
      out[c.id] = { days: rep.days.filter((d) => d.day >= since).map((d) => ({ day: d.day, views: d.views, clicks: d.clicks })), reach: rep.totals.reach, frozenAt: rep.reachFrozenAt };
    } catch {
      out[c.id] = null;
    }
  }));
  return out;
}

// ── עמוד קמפיין / האשף ──

export interface AdHistoryRow { action: string; admin_email: string | null; created_at: string; entity_type: string; metadata: Record<string, unknown> }
export interface CampaignPageData {
  state: "ok";
  today: string;
  campaign: AdCampaignRow | null;
  creatives: AdCreativeRow[];
  contracts: Array<{ id: string; label: string; advertiser: string; advertiser_id: string; pricing: Pricing; price_ils: number; status: ContractStatus; starts_on: string; ends_on: string }>;
  advertisers: AdAdvertiserRow[];
  buildings: AdBuildingOption[];
  cities: string[];
  report: unknown;
  /** היומן של הפאנל על הקמפיין ועל המודעות שלו; null — הקריאה נכשלה. */
  history: AdHistoryRow[] | null;
}

/** היומן של הפאנל (AD_* ו-BLOC_ACTION_*) על הקמפיין ועל המודעות שלו — 100 האחרונות. */
export async function loadCampaignHistory(campaignId: string, creativeIds: string[]): Promise<AdHistoryRow[] | null> {
  const ids = [campaignId, ...creativeIds].slice(0, 200);
  const r = await adminClient.from("panel_audit_logs").select("action, admin_email, created_at, entity_type, entity_id, metadata")
    .in("entity_id", ids).in("entity_type", ["ad_campaign", "ad_creative"]).order("created_at", { ascending: false }).limit(100);
  if (r.error) return null;
  return ((r.data ?? []) as Row[]).map((h) => ({
    action: String(h.action ?? ""), admin_email: h.admin_email ?? null, created_at: String(h.created_at ?? ""), entity_type: String(h.entity_type ?? ""),
    metadata: h.metadata && typeof h.metadata === "object" ? h.metadata as Record<string, unknown> : {},
  }));
}

/** עמוד קמפיין (או קמפיין חדש, id = null). */
export async function loadCampaignPage(id: string | null): Promise<CampaignPageData | { state: "missing" } | { state: "error" } | { state: "not_found" }> {
  const ov = await loadAdsOverview();
  if (ov.state !== "ok") return ov;
  const campaign = id ? ov.campaigns.find((c) => c.id === id) ?? null : null;
  if (id && !campaign) return { state: "not_found" };
  let creatives: AdCreativeRow[] = [];
  let report: unknown = null;
  let history: AdHistoryRow[] | null = [];
  if (id) {
    creatives = ov.creatives.filter((c) => c.campaign_id === id);
    const rep = await adminClient.rpc("ad_report", { p_campaign: id });
    if (rep.error) return adsSqlMissing(rep.error as any) ? { state: "missing" } : { state: "error" };
    report = rep.data;
    history = await loadCampaignHistory(id, creatives.map((c) => c.id));
  }
  const contracts = ov.advertisers.flatMap((a) => a.contracts.map((k) => ({
    id: k.id, advertiser: a.name, advertiser_id: a.id, pricing: k.pricing, price_ils: k.price_ils, status: k.status, starts_on: k.starts_on, ends_on: k.ends_on,
    // מספר החוזה (משמאל לימין) מבודד — בלי שהסוגריים יתהפכו בתוך <option> בעברית
    label: `${a.name}${k.reference ? ` (⁦${k.reference}⁩)` : ""}`,
  })));
  const cities = [...new Set(ov.buildings.map((b) => b.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "he"));
  return { state: "ok", today: ov.today, campaign, creatives, contracts, advertisers: ov.advertisers, buildings: ov.buildings, cities, report, history };
}
