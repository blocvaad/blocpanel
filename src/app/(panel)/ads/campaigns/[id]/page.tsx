import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadCampaignPage } from "@/lib/adsServer";
import { ADS_SQL_MISSING, parseReport } from "@/lib/ads";
import { wizardStep, campaignTabOf } from "@/lib/adsStudio";
import CampaignWizard from "@/components/ads/studio/CampaignWizard";
import CampaignStudio from "@/components/ads/studio/CampaignStudio";
import { Banner } from "@/components/ui/panelKit";
import { campaignArrival } from "@/lib/adsUi";
export const dynamic = "force-dynamic";

// קמפיין בסטודיו (bloc ADS-2א v2, החלטה 383): טיוטה — האשף בשלב שלה (?step=); אחרת — הדף עם הלשוניות (?tab=).
// PANEL-PAY א2ב: אחרי יצירה (?created=1), שכפול (?copied=1) או פרסום (?published=1|scheduled) — הודעה בראש הדף; שכפול שבו
// הפרסומות לא הועתקו (&creatives=failed, או unknown כשלא ידוע) אומר את זה, ולא "שוכפל" סתם.
export default async function CampaignPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession("ads.read");
  const { id } = await params;
  const arrival = campaignArrival(await searchParams);
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadCampaignPage(id);
  if (data.state === "not_found") notFound();
  const canManage = can(session.role, "ads.manage");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "1100px" }}>
      {data.state === "missing" && <Banner tone="warn">{ADS_SQL_MISSING}</Banner>}
      {data.state === "error" && <Banner tone="error">טעינת הקמפיין נכשלה. רעננו את הדף.</Banner>}
      {arrival && <Banner tone={arrival.tone}><span data-campaign-arrival={arrival.tone}>{arrival.text}</span></Banner>}
      {data.state === "ok" && data.campaign && (() => {
        const report = parseReport(data.report);
        const serves = Object.fromEntries(report.creatives.map((c) => [c.creative_id, c.serves]));
        const camp = data.campaign;
        if (camp.status === "draft" && canManage) {
          return (
            <CampaignWizard today={data.today} campaign={camp} creatives={data.creatives} serves={serves} advertisers={data.advertisers}
              contracts={data.contracts} buildings={data.buildings} cities={data.cities} initialStep={wizardStep(true, data.creatives.length, one(sp.step))} template={one(sp.template)} />
          );
        }
        return (
          <CampaignStudio today={data.today} campaign={camp} creatives={data.creatives} report={report} serves={serves} history={data.history}
            contracts={data.contracts} advertiser={data.advertisers.find((a) => a.id === camp.advertiser_id) ?? null} buildings={data.buildings}
            cities={data.cities} canManage={canManage} initialTab={campaignTabOf(one(sp.tab))} />
        );
      })()}
    </div>
  );
}
