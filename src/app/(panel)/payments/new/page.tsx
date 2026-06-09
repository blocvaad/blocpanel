import { adminClient } from "@/lib/supabase";
import CreatePaymentForm from "@/components/ui/CreatePaymentForm";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
export const dynamic = "force-dynamic";

export default async function NewPaymentPage() {
  const { data: buildings } = await adminClient
    .from("buildings")
    .select("id,name")
    .eq("is_archived", false)
    .order("name");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "500px" }}>
      <Link href="/payments" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
        <ArrowRight size={14} />חזרה לתשלומים
      </Link>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>יצירת תשלום ידני</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>חיוב דייר או בניין ידנית</p>
      </div>
      <CreatePaymentForm buildings={buildings ?? []} />
    </div>
  );
}
