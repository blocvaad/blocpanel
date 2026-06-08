import { adminClient } from "@/lib/supabase";
import BuildingsTable from "@/components/ui/BuildingsTable";
export const dynamic = "force-dynamic";
export default async function BuildingsPage() {
  const { data: buildings, count } = await adminClient.from("panel_buildings_view").select("*",{count:"exact"}).order("created_at",{ascending:false}).limit(50);
  return (
    <div className="space-y-5 animate-fade-in">
      <div><h1 className="text-lg font-bold text-[#E2E8F0]" style={{fontFamily:"var(--font-display)"}}>בניינים</h1><p className="text-xs text-[#64748B] mt-0.5">{count??0} בניינים סה״כ</p></div>
      <BuildingsTable initialData={buildings??[]}/>
    </div>
  );
}
