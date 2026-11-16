import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { loadReportsQueue } from "@/lib/adsServer";
import { groupReports, toReportCampaign, toReportCreative, type ReportsFilter } from "@/lib/adsReports";
import ReportsQueue from "@/components/ads/studio/ReportsQueue";
export const dynamic = "force-dynamic";

// תור הדיווחים (bloc ADS-2ב1, החלטה 390): דיווחים של דיירים על פרסומות, לפי קמפיין. קריאה בלבד מכאן (ה-service role, כמו שאר הסטודיו,
// עד א3) — רק העמודות של REPORT_COLUMNS, אף פעם לא מי דיווח; הקיבוץ כאן בשרת, ולדפדפן נשלחות רק הקבוצות (בלי שאר השדות של הקמפיין
// והמודעה). ההחלטות — דרך bloc (reports.review). לפני SQL 231 — אומרים את זה; קריאה שנכשלה — "נכשל" עם "נסו שוב" (לא רשימה ריקה).
export default async function AdsReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageSession("ads.read");
  const sp = await searchParams;
  const filter: ReportsFilter = sp.filter === "all" ? "all" : "new";
  const data = await loadReportsQueue();
  const groups = data.state === "ok"
    ? groupReports(data.reports, data.campaigns.map(toReportCampaign), data.creatives.map(toReportCreative))
    : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      <ReportsQueue state={data.state} groups={groups} canManage={can(session.role, "ads.manage")} initialFilter={filter}
        truncated={data.state === "ok" && data.truncated} />
    </div>
  );
}
