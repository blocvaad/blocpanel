// ספקי סליקה — אילו ספקים מוצעים לוועדים במסך אמצעי התשלום (bloc PAY-M, SQL 202).
// כל הצוות עם payments.read רואה; רק סופר-אדמין מדליק ומכבה.
import { requirePageSession } from "@/lib/pageAuth";
import { adminClient } from "@/lib/supabase";
import CollectionProvidersCard from "@/components/ui/CollectionProvidersCard";
import { providersView, isMissing202, isMissing225, type ProvidersState } from "@/lib/collectionProviders";
export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const session = await requirePageSession("payments.read");
  const [first, usage] = await Promise.all([
    adminClient.from("platform_payment_providers").select("provider, offered, updated_at, updated_by, gate_closed_at, gate_closed_by, gate_evidence"),
    adminClient.rpc("panel_payment_provider_usage"),
  ]);
  // עמודות השער (SQL 225 של bloc) עוד לא קיימות — קוראים בלי הן, והכרטיס מוצג כמו קודם עם הערה. לא קורסים.
  const gateColumns = !(first.error && isMissing225(first.error));
  const rows = gateColumns
    ? first
    : await adminClient.from("platform_payment_providers").select("provider, offered, updated_at, updated_by");
  const state: ProvidersState = rows.error ? (isMissing202(rows.error) ? "missing" : "error") : "ok";
  if (rows.error && state === "error") console.error("[collection] providers", rows.error);
  const view = providersView(
    rows.error ? [] : ((rows.data ?? []) as Parameters<typeof providersView>[0]),
    usage.error ? null : ((usage.data ?? []) as Parameters<typeof providersView>[1]),
    gateColumns,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "720px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>ספקי סליקה</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
          אילו דרכי תשלום הוועדים יכולים לחבר. bit והעברה בנקאית — תמיד.
        </p>
      </div>
      <CollectionProvidersCard rows={view} state={state} canEdit={session.role === "superadmin"} />
    </div>
  );
}
