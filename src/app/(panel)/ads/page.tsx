import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadAdsOverview } from "@/lib/adsServer";
import { ADS_SQL_MISSING } from "@/lib/ads";
import AdsCenter from "@/components/ads/AdsCenter";
import { Banner } from "@/components/ui/panelKit";
export const dynamic = "force-dynamic";

// פרסומות ממומנות (bloc ADS-1; החלטות 74–75): קמפיינים, מפרסמים וחוזים, הגדרות. לפני SQL 175 — אומרים את זה.
export default async function AdsPage() {
  const session = await requirePageSession("ads.read");
  const data = await loadAdsOverview();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>פרסומות</h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.6 }}>
          פרסומת ממומנת במסך מלא באפליקציה של הדיירים: מפרסם, חוזה, קמפיין עם תזמון ומיקוד, ודוח למפרסם במספרים מצטברים בלבד.
        </p>
      </div>
      {data.state === "missing" && <Banner tone="warn"><span data-ads-missing="">{ADS_SQL_MISSING}</span></Banner>}
      {data.state === "error" && <Banner tone="error"><span data-ads-error="">טעינת הפרסומות נכשלה. רעננו את הדף.</span></Banner>}
      {data.state === "ok" && (
        <AdsCenter today={data.today} settings={data.settings} advertisers={data.advertisers} campaigns={data.campaigns}
          buildings={data.buildings} canManage={can(session.role, "ads.manage")} />
      )}
    </div>
  );
}
