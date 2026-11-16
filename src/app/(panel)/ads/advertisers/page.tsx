import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadAdsOverview } from "@/lib/adsServer";
import { ADS_SQL_MISSING } from "@/lib/ads";
import { AdvertisersStudio } from "@/components/ads/studio/AdvertisersStudio";
import { Banner } from "@/components/ui/panelKit";
export const dynamic = "force-dynamic";

// המפרסמים בסטודיו (bloc ADS-2א v2, החלטה 383).
export default async function AdvertisersPage() {
  const session = await requirePageSession("ads.read");
  const data = await loadAdsOverview();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      {data.state === "missing" && <Banner tone="warn"><span data-ads-missing="">{ADS_SQL_MISSING}</span></Banner>}
      {data.state === "error" && <Banner tone="error"><span data-ads-error="">טעינת המפרסמים נכשלה. רעננו את הדף.</span></Banner>}
      {data.state === "ok" && <AdvertisersStudio advertisers={data.advertisers} campaigns={data.campaigns} canManage={can(session.role, "ads.manage")} today={data.today} />}
    </div>
  );
}
