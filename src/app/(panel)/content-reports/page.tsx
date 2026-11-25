import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { crFilterOf } from "@/lib/contentReports";
import ContentReportsClient from "@/components/contentReports/ContentReportsClient";
export const dynamic = "force-dynamic";

// הדיווחים על תוכן מהצ'אט, מהלוח ומהשוק (bloc SAFETY-1, MG-S1241, החלטות 676–677): התור — בלי תוכן ובלי מי דיווח; פריט נפתח בתוך
// הרשימה (הפתיחה נרשמת), ומשם הסתרה / החזרה / העברה לוועד. מנהל וסופר-אדמין בלבד (content_reports.read; נבדק גם ב-bloc). הסינון
// בכתובת. הדף הוא מעטפת בלבד — הנתונים מ-/api/content-reports, כדי שלא יישמרו בעותק של הדף שה-service worker של הפאנל שומר.
export default async function ContentReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageSession("content_reports.read");
  const filter = crFilterOf((await searchParams) ?? {});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1000px" }}>
      <ContentReportsClient filter={filter} canManage={can(session.role, "content_reports.manage")} />
    </div>
  );
}
