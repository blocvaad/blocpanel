import { requirePageSession } from "@/lib/pageAuth";
import { loadCampaignPage } from "@/lib/adsServer";
import { ADS_SQL_MISSING } from "@/lib/ads";
import CampaignWizard from "@/components/ads/studio/CampaignWizard";
import { Banner } from "@/components/ui/panelKit";
export const dynamic = "force-dynamic";

// "קמפיין חדש" — האשף של הסטודיו (bloc ADS-2א v2, החלטה 383). ?advertiser=<id> — המפרסם נבחר מראש; ?template=<key> — תבנית טקסט.
// היציאה מהשלב הראשון שומרת טיוטה ועוברת לכתובת שלה (/ads/campaigns/<id>?step=2).
export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageSession("ads.manage");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const data = await loadCampaignPage(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      {data.state === "missing" && <Banner tone="warn">{ADS_SQL_MISSING}</Banner>}
      {data.state === "error" && <Banner tone="error">הטעינה נכשלה. רעננו את הדף.</Banner>}
      {data.state === "ok" && (
        <CampaignWizard today={data.today} campaign={null} creatives={[]} serves={{}} advertisers={data.advertisers} contracts={data.contracts}
          buildings={data.buildings} cities={data.cities} initialAdvertiser={one(sp.advertiser)} template={one(sp.template)} />
      )}
    </div>
  );
}
