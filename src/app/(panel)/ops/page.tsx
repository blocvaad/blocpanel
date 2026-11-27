// מרכז התפעול — bloc OPS-1 (שלב 9, החלטות 752–755): המשימות המתוזמנות, הגיבוי והשחזור, התורים, התקלות וספרי ההפעלה.
import { requirePageSession } from "@/lib/pageAuth";
import OpsBoard from "@/components/ui/OpsBoard";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  await requirePageSession("ops.read");
  return <OpsBoard />;
}
