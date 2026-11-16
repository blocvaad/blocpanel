import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadAdsOverview, loadStudioDaily } from "@/lib/adsServer";
import { STUDIO_TABS, type StudioTab } from "@/lib/adsStudio";
import StudioHome from "@/components/ads/studio/StudioHome";
export const dynamic = "force-dynamic";

// "סטודיו הפרסום" (bloc ADS-2א v2, החלטה 383) — מסך הבית: מדדים לטווח, לשוניות מצב, כרטיס לכל קמפיין. לפני SQL 175 — אומרים את
// זה; קריאה שנכשלה — מצב "נכשל" עם "נסו שוב" (לא רשימה ריקה). הימים לקו הקטן ולטווח — מ-ad_report של כל קמפיין (קריאה בלבד).
export default async function AdsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageSession("ads.read");
  const sp = await searchParams;
  const tab = STUDIO_TABS.find((t) => t.key === sp.tab)?.key as StudioTab | undefined;
  const data = await loadAdsOverview();
  const daily = data.state === "ok" ? await loadStudioDaily(data.campaigns, data.today) : {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      <StudioHome state={data.state} today={data.state === "ok" ? data.today : ""} campaigns={data.state === "ok" ? data.campaigns : []}
        advertisers={data.state === "ok" ? data.advertisers : []} daily={daily} enabled={data.state === "ok" ? data.settings.enabled : true}
        canManage={can(session.role, "ads.manage")} initialTab={tab} />
    </div>
  );
}
