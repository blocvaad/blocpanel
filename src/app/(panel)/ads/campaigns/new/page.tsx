import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
export const dynamic = "force-dynamic";

// ADS-2א v2: קמפיין חדש עבר לאשף של הסטודיו — הכתובת הישנה מפנה אליו.
export default async function OldNewCampaignPage() {
  await requirePageSession("ads.manage");
  redirect("/ads/new");
}
