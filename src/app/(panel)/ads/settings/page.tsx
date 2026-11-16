import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadAdsOverview } from "@/lib/adsServer";
import { ADS_SQL_MISSING } from "@/lib/ads";
import StudioSettings from "@/components/ads/studio/StudioSettings";
import { Banner } from "@/components/ui/panelKit";
export const dynamic = "force-dynamic";

// הגדרות הסטודיו (bloc ADS-2א v2): המתג, מכשירי בדיקה, בניינים בלי פרסומות, בדיקת משתמש והכללים.
export default async function AdsSettingsPage() {
  const session = await requirePageSession("ads.read");
  const data = await loadAdsOverview();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
      {data.state === "missing" && <Banner tone="warn"><span data-ads-missing="">{ADS_SQL_MISSING}</span></Banner>}
      {data.state === "error" && <Banner tone="error"><span data-ads-error="">טעינת ההגדרות נכשלה. רעננו את הדף.</span></Banner>}
      {data.state === "ok" && <StudioSettings settings={data.settings} buildings={data.buildings} canManage={can(session.role, "ads.manage")} today={data.today} />}
    </div>
  );
}
