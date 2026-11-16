import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadAdsOverview } from "@/lib/adsServer";
import { ADS_SQL_MISSING } from "@/lib/ads";
import { AdvertiserStudio } from "@/components/ads/studio/AdvertisersStudio";
import { Banner } from "@/components/ui/panelKit";
export const dynamic = "force-dynamic";

// דף מפרסם בסטודיו (bloc ADS-2א v2, החלטה 383): פרטים, המותג (לוגו וצבע — דרך bloc), חוזים וקמפיינים.
export default async function AdvertiserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("ads.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadAdsOverview();
  const adv = data.state === "ok" ? data.advertisers.find((a) => a.id === id) : undefined;
  if (data.state === "ok" && !adv) notFound();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
      {data.state === "missing" && <Banner tone="warn"><span data-ads-missing="">{ADS_SQL_MISSING}</span></Banner>}
      {data.state === "error" && <Banner tone="error"><span data-ads-error="">טעינת המפרסם נכשלה. רעננו את הדף.</span></Banner>}
      {data.state === "ok" && adv && <AdvertiserStudio advertiser={adv} campaigns={data.campaigns} canManage={can(session.role, "ads.manage")} today={data.today} />}
    </div>
  );
}
