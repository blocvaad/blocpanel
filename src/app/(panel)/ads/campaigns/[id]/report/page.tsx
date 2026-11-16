import { notFound, redirect } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
export const dynamic = "force-dynamic";

// ADS-2א v2: הדוח עבר ללשונית "ביצועים" בדף הקמפיין (וההדפסה — ל-/print); הכתובת הישנה מפנה אליה.
export default async function OldReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession("ads.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  redirect(`/ads/campaigns/${id}?tab=performance`);
}
