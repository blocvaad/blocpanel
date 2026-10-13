import { notFound } from "next/navigation";
import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import { can } from "@/lib/permissions";
import { fetchAll } from "@/lib/fetchAll";
import { loadPerson } from "@/lib/people";
import { maskEmail, maskPhone } from "@/lib/mask";
import PersonView from "@/components/ui/PersonView";
export const dynamic = "force-dynamic";

// דף אדם (bloc UI-R5c-1) — כל הבניינים שלו, התפקידים, התשלומים לפי החשבון, ומה נעשה איתו.
// קריאה שנכשלה — אומרים (לא "לא נמצא"). viewer — בלי פרטי קשר מלאים ובלי פעולות.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession("tenants.read");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const detail = await loadPerson(adminClient, id);
  if (detail === "error") {
    return (
      <div dir="rtl" className="card" style={{ padding: "20px", maxWidth: "820px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ fontSize: "15px", color: "var(--text)", fontWeight: 700 }}>לא הצלחנו לטעון את הדף.</p>
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }}>זו תקלה בקריאה, לא סימן שהאדם לא קיים. רעננו את הדף בעוד רגע.</p>
        <Link href="/tenants" style={{ fontSize: "14.5px", color: "var(--blue)", minHeight: "44px", display: "inline-flex", alignItems: "center" }}>חזרה לדיירים</Link>
      </div>
    );
  }
  if (!detail) notFound();

  const canAct = can(session.role, "tenants.modify");
  const shown = canAct ? detail : {
    ...detail,
    person: { ...detail.person, phone: maskPhone(detail.person.phone), email: maskEmail(detail.person.email) },
  };

  // בניינים למעבר — פעילים ולא בארכיון, בדפים (בלי תקרת 1,000). כשל — נאמר בחלון המעבר, לא "אין בניינים".
  const list = canAct
    ? await fetchAll<{ id: string; name: string | null }>((from, to) =>
        adminClient.from("buildings").select("id, name").not("is_archived", "is", true).not("is_active", "is", false)
          .order("name", { ascending: true }).order("id", { ascending: true }).range(from, to) as never)
    : null;
  const buildings = (list?.rows ?? []).map((b) => ({ id: b.id, name: (b.name ?? "").trim() || "בניין ללא שם" }));

  return <PersonView detail={shown} canAct={canAct} buildings={buildings} buildingsFailed={!!list?.error} />;
}
