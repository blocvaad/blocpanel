import { adminClient } from "@/lib/supabase";
import BroadcastForm from "@/components/ui/BroadcastForm";
export const dynamic = "force-dynamic";

export default async function BroadcastPage() {
  const { data: buildings } = await adminClient
    .from("buildings").select("id,name").order("name");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>שליחת הודעה</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>שלח הכרזה לדיירים — לבניין אחד או לכולם</p>
      </div>
      <BroadcastForm buildings={buildings ?? []} />
    </div>
  );
}
