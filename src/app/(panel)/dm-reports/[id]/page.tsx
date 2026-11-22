import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import DmReportView from "@/components/dmReports/DmReportView";
export const dynamic = "force-dynamic";

// דיווח אחד על שיחה פרטית (bloc MG-S1179, החלטות 520, 584–585). מנהל וסופר-אדמין בלבד. סקירת MOD-1 (#2): הדף הוא מעטפת — הדיווח
// נטען בדפדפן מ-/api/dm-reports/one (POST שנרשם ב-bloc לפני שהתוכן יוצא, וביומן הפאנל), כדי שהתוכן לא יישמר בעותק של הדף שה-service
// worker של הפאנל שומר.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DmReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("dm_reports.read");
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "900px" }}>
      <DmReportView id={id.toLowerCase()} canManage={can(session.role, "dm_reports.manage")} />
    </div>
  );
}
