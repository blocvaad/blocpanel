// BillingFactsCard — "מנוי, משלם, סליקה" בדף הבניין: מי משלם על המנוי, חברת הניהול, סליקת הדיירים וקוד הכניסה.
// PANEL-PAY א2ב (החלטה 375): "סליקת דיירים" דרך tenantCollectionText — כבויה / ידנית / מחוברת עם שם הספק, אף פעם לא
// מזהה גולמי ("מחוברת · none"). הפאנל לא קורא את המפתחות או את קוד הדלת עצמם — רק "מוגדר / לא מוגדר" (bloc 125).
// תצוגה בלבד — נבדקת בלי DOM.
import { tenantCollectionText } from "@/lib/collectionProviders";

export type BillingFacts = {
  company_name: string | null;
  company_state: string | null;
  payment_provider: string | null;
  has_gateway: boolean | null;
  has_door_code: boolean | null;
};

export default function BillingFactsCard({ billing, payer }: { billing: BillingFacts; payer: string | null }) {
  return (
    <div className="card" style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }} data-billing-facts="">
      <Fact label="משלם על המנוי" value={payer ?? "—"} />
      <Fact label="חברת ניהול" value={billing.company_name ? `${billing.company_name}${billing.company_state === "managed_unpaid" ? " · ללא מסלול" : ""}` : "—"} />
      <Fact label="סליקת דיירים" value={tenantCollectionText(billing.payment_provider, billing.has_gateway)} />
      <Fact label="קוד כניסה" value={billing.has_door_code ? "מוגדר (מוסתר)" : "לא הוגדר"} />
    </div>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div data-fact={label}>
      <div style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: ".06em", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{value}</div>
    </div>
  );
}
