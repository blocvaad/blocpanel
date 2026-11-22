import { requirePageSession } from "@/lib/pageAuth";
import { dmFilterOf } from "@/lib/dmReports";
import DmReportsQueueClient from "@/components/dmReports/DmReportsQueueClient";
export const dynamic = "force-dynamic";

// הדיווחים על הודעות פרטיות (bloc MG-S1179, החלטות 584–587): התור — בלי שום תוכן (מי דיווח על מי, הבניין, הסיבה, הזמן, כמה הודעות
// וקבצים), עם יעד לבדיקה לפי הסיבה. מנהל וסופר-אדמין בלבד (dm_reports.read; נבדק גם ב-bloc). הסינון בכתובת. סקירת MOD-1 (#2): הדף
// הוא מעטפת בלבד — הרשימה נטענת מ-/api/dm-reports, כדי שלא תישמר בעותק של הדף שה-service worker של הפאנל שומר.
export default async function DmReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageSession("dm_reports.read");
  const filter = dmFilterOf((await searchParams) ?? {});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
      <DmReportsQueueClient filter={filter} />
    </div>
  );
}
