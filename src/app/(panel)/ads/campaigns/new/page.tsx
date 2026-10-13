import { requirePageSession } from "@/lib/pageAuth";
import { loadCampaignPage } from "@/lib/adsServer";
import { ADS_SQL_MISSING } from "@/lib/ads";
import CampaignEditor from "@/components/ads/CampaignEditor";
import { Banner } from "@/components/ui/panelKit";
export const dynamic = "force-dynamic";

// קמפיין חדש (bloc ADS-1) — נשמר כטיוטה; אחרי השמירה מוסיפים פרסומת ומפעילים.
export default async function NewCampaignPage() {
  await requirePageSession("ads.manage");
  const data = await loadCampaignPage(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>קמפיין חדש</h1>
      {data.state === "missing" && <Banner tone="warn">{ADS_SQL_MISSING}</Banner>}
      {data.state === "error" && <Banner tone="error">הטעינה נכשלה. רעננו את הדף.</Banner>}
      {data.state === "ok" && (data.contracts.some((k) => k.status !== "cancelled" && k.ends_on >= data.today) ? (
        <CampaignEditor today={data.today} campaign={null} creatives={[]} contracts={data.contracts}
          buildings={data.buildings} cities={data.cities} canManage creativeServes={{}} />
      ) : (
        <Banner tone="info">אין חוזה פעיל או טיוטה בתוקף. קודם מוסיפים מפרסם וחוזה, בלשונית &quot;מפרסמים וחוזים&quot;.</Banner>
      ))}
    </div>
  );
}
