import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadCampaignPage } from "@/lib/adsServer";
import { ADS_SQL_MISSING, parseReport } from "@/lib/ads";
import CampaignEditor from "@/components/ads/CampaignEditor";
import CampaignReport from "@/components/ads/CampaignReport";
import { Banner } from "@/components/ui/panelKit";
import { campaignArrival } from "@/lib/adsUi";
export const dynamic = "force-dynamic";

// קמפיין (bloc ADS-1): העריכה, הפרסומות והדוח.
// PANEL-PAY א2ב: אחרי יצירה (?created=1) או שכפול (?copied=1) — הודעה בראש הדף; שכפול שבו הפרסומות לא הועתקו
// (&creatives=failed, או unknown כשלא ידוע) אומר את זה, ולא "שוכפל" סתם.
export default async function CampaignPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession("ads.read");
  const { id } = await params;
  const arrival = campaignArrival(await searchParams);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadCampaignPage(id);
  if (data.state === "not_found") notFound();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
      {data.state === "missing" && <Banner tone="warn">{ADS_SQL_MISSING}</Banner>}
      {data.state === "error" && <Banner tone="error">טעינת הקמפיין נכשלה. רעננו את הדף.</Banner>}
      {data.state === "ok" && data.campaign && (() => {
        const report = parseReport(data.report);
        const serves = Object.fromEntries(report.creatives.map((c) => [c.creative_id, c.serves]));
        const names = Object.fromEntries(data.creatives.map((c) => [c.id, c.headline]));
        return (
          <>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>{data.campaign.name}</h1>
            {arrival && <Banner tone={arrival.tone}><span data-campaign-arrival={arrival.tone}>{arrival.text}</span></Banner>}
            <CampaignEditor today={data.today} campaign={data.campaign} creatives={data.creatives} contracts={data.contracts}
              buildings={data.buildings} cities={data.cities} canManage={can(session.role, "ads.manage")} creativeServes={serves} />
            <CampaignReport campaignId={data.campaign.id} report={report} creativeNames={names} />
          </>
        );
      })()}
    </div>
  );
}
