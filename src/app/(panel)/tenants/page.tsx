import { adminClient } from "@/lib/supabase";
import TenantsTable from "@/components/ui/TenantsTable";
export const dynamic = "force-dynamic";
export default async function TenantsPage() {
  const { data: tenants, count } = await adminClient.from("panel_tenants_view").select("*",{count:"exact"}).order("created_at",{ascending:false}).limit(100);
  return (
    <div className="space-y-5 animate-fade-in">
      <div><h1 className="text-lg font-bold text-[#E2E8F0]" style={{fontFamily:"var(--font-display)"}}>דיירים</h1><p className="text-xs text-[#64748B] mt-0.5">{count??0} דיירים · פרטי פרטיות לפי הגדרות הדייר 🔒</p></div>
      <TenantsTable initialData={tenants??[]}/>
    </div>
  );
}
