import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import { fetchAll } from "@/lib/fetchAll";
import { blocConfig } from "@/lib/blocApi";
import BroadcastCenter from "@/components/ui/BroadcastCenter";
export const dynamic = "force-dynamic";

// הודעות לבניינים (bloc UI-R5a): שליחה, ומה שנשלח — הורדה, עריכה, תוקף, מחיקה.
// הבניינים: כל מי שלא בארכיון (מושעה — מוצג, לא לבחירה), בדפים — בלי תקרת 1,000.
export default async function BroadcastPage() {
  await requirePageSession("broadcast.send");
  const res = await fetchAll<{ id: string; name: string | null; is_active: boolean | null }>((from, to) =>
    adminClient.from("buildings").select("id, name, is_active").not("is_archived", "is", true)
      .order("name", { ascending: true }).order("id", { ascending: true }).range(from, to) as any);
  const buildings = res.rows.map((b) => ({
    id: b.id,
    name: (b.name ?? "").trim() || "בניין ללא שם",
    suspended: b.is_active === false,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "760px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>הודעות לבניינים</h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.6 }}>
          הודעה מצוות bloc לדיירים, לכל הבניינים או לבניינים נבחרים. אפשר להוריד, לערוך ולשנות תוקף גם אחרי השליחה.
        </p>
      </div>
      <BroadcastCenter buildings={buildings} configured={!!blocConfig()} buildingsError={res.error} />
    </div>
  );
}
