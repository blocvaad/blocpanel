import { requirePageSession } from "@/lib/pageAuth";
import PeopleList from "@/components/ui/PeopleList";
export const dynamic = "force-dynamic";

// דיירים וועד (bloc UI-R5c-1): בקשות הצטרפות שממתינות בכל הבניינים, כל הדיירים והוועד, וחשבונות חסומים.
// הרשימה נטענת בדפים מהשרת (/api/people); הפעולות — דרך bloc (/api/members).
export default async function TenantsPage() {
  await requirePageSession("tenants.read");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "860px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>דיירים וועד</h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px", lineHeight: 1.6 }}>
          בקשות הצטרפות שממתינות, מי חבר באיזה בניין ובאיזה תפקיד, וחשבונות חסומים. לחיצה על שם פותחת את כל הפרטים והפעולות.
        </p>
      </div>
      <PeopleList />
    </div>
  );
}
