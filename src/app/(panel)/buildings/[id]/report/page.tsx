import { adminClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import PrintButton from "@/components/ui/PrintButton";
export const dynamic = "force-dynamic";

export default async function BuildingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: building } = await adminClient.from("buildings").select("*").eq("id", id).single();
  if (!building) notFound();

  const [
    { data: tenants },
    { data: tickets },
    { data: payments },
  ] = await Promise.all([
    adminClient.from("panel_tenants_view").select("*").eq("building_id", id).order("apartment_display"),
    adminClient.from("panel_tickets_view").select("*").eq("building_id", id).order("created_at", { ascending: false }),
    adminClient.from("panel_payments_view").select("*").eq("building_id", id).order("created_at", { ascending: false }),
  ]);

  const openTickets   = (tickets ?? []).filter(t => t.status === "פתוח" || t.status === "open");
  const paidTotal     = (payments ?? []).filter(p => p.status === "paid").reduce((s, p) => s + (p.amount ?? 0), 0);
  const pendingTotal  = (payments ?? []).filter(p => p.status === "pending" || p.status === "pending_approval").reduce((s, p) => s + (p.amount ?? 0), 0);
  const today         = new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });

  const STATUS_HE: Record<string, string> = {
    "פתוח": "פתוח", open: "פתוח", "בטיפול": "בטיפול",
    in_progress: "בטיפול", "טופל": "טופל", resolved: "טופל",
    "סגור": "סגור", closed: "סגור",
  };

  const ROLE_HE: Record<string, string> = { admin: "מנהל", council: "ועד", tenant: "דייר" };
  const PAY_HE: Record<string, string> = { paid: "שולם", pending: "ממתין", pending_approval: "ממתין", failed: "נכשל", cancelled: "בוטל", exempt: "פטור" };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .page-break { page-break-before: always; }
        }
        @page { margin: 20mm; size: A4; }
        body { direction: rtl; font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f3f4f6; padding: 8px 10px; text-align: right; font-weight: 600; border: 1px solid #e5e7eb; }
        td { padding: 7px 10px; border: 1px solid #e5e7eb; font-size: 12px; }
        tr:nth-child(even) td { background: #f9fafb; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-red   { background: #fee2e2; color: #991b1b; }
        .badge-yellow{ background: #fef9c3; color: #854d0e; }
        .badge-gray  { background: #f3f4f6; color: #374151; }
      `}</style>

      {/* Print button - hidden on print */}
      <div className="no-print" style={{ padding: "16px", background: "#09090b", minHeight: "100vh" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "white" }}>דוח בניין — {building.name}</div>
              <div style={{ fontSize: "13px", color: "#71717a", marginTop: "3px" }}>לחץ הדפס לשמירה כ-PDF</div>
            </div>
            <PrintButton />
          </div>
        </div>
      </div>

      {/* Report content */}
      <div id="report" style={{ maxWidth: "800px", margin: "0 auto", padding: "32px", background: "white", color: "#111" }}>

        {/* Header */}
        <div style={{ borderBottom: "3px solid #111", paddingBottom: "16px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: "26px", fontWeight: "900", margin: "0 0 4px" }}>{building.name}</h1>
              {building.address && <div style={{ fontSize: "14px", color: "#6b7280" }}>{building.address}</div>}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>דוח נוצר</div>
              <div style={{ fontSize: "14px", fontWeight: "600" }}>{today}</div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>קוד: {building.invite_code}</div>
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "28px" }}>
          {[
            { label: "דיירים", value: (tenants ?? []).length, color: "#2563eb" },
            { label: "תקלות פתוחות", value: openTickets.length, color: openTickets.length > 0 ? "#dc2626" : "#16a34a" },
            { label: "הכנסות שולמו", value: `₪${paidTotal.toLocaleString("he-IL")}`, color: "#16a34a" },
            { label: "חוב פתוח", value: `₪${pendingTotal.toLocaleString("he-IL")}`, color: pendingTotal > 0 ? "#dc2626" : "#16a34a" },
          ].map(s => (
            <div key={s.label} style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Open tickets - priority section */}
        {openTickets.length > 0 && (
          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "700", borderBottom: "2px solid #dc2626", paddingBottom: "6px", marginBottom: "12px", color: "#dc2626" }}>
              ⚠️ תקלות פתוחות — דורשות טיפול ({openTickets.length})
            </h2>
            <table>
              <thead>
                <tr><th>כותרת</th><th>מדווח</th><th>עדיפות</th><th>תאריך</th></tr>
              </thead>
              <tbody>
                {openTickets.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: "500" }}>{t.title}</td>
                    <td style={{ color: "#6b7280" }}>{t.reporter_name ?? "—"}</td>
                    <td>
                      <span className={`badge ${t.priority === "high" || t.priority === "urgent" ? "badge-red" : "badge-yellow"}`}>
                        {t.priority ?? "—"}
                      </span>
                    </td>
                    <td style={{ color: "#6b7280" }}>{new Date(t.created_at).toLocaleDateString("he-IL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tenants */}
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "700", borderBottom: "2px solid #111", paddingBottom: "6px", marginBottom: "12px" }}>
            דיירים ({(tenants ?? []).length})
          </h2>
          <table>
            <thead>
              <tr><th>שם</th><th>דירה</th><th>תפקיד</th><th>טלפון</th><th>סטטוס</th><th>הצטרף</th></tr>
            </thead>
            <tbody>
              {(tenants ?? []).map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: "500" }}>{t.full_name}</td>
                  <td>{t.apartment_display.startsWith("🔒") ? "—" : t.apartment_display}</td>
                  <td>{ROLE_HE[t.role] ?? t.role}</td>
                  <td style={{ fontFamily: "monospace" }}>{t.phone_masked.startsWith("🔒") ? "—" : t.phone_masked}</td>
                  <td>
                    <span className={`badge ${t.approval_status === "approved" ? "badge-green" : t.approval_status === "blocked" ? "badge-red" : "badge-yellow"}`}>
                      {t.approval_status === "approved" ? "מאושר" : t.approval_status === "blocked" ? "חסום" : "ממתין"}
                    </span>
                  </td>
                  <td style={{ color: "#6b7280" }}>{new Date(t.created_at).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payments */}
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "700", borderBottom: "2px solid #111", paddingBottom: "6px", marginBottom: "12px" }}>
            תשלומים ({(payments ?? []).length})
          </h2>
          <table>
            <thead>
              <tr><th>תיאור</th><th>דייר</th><th>סכום</th><th>סטטוס</th><th>תאריך</th></tr>
            </thead>
            <tbody>
              {(payments ?? []).map(p => (
                <tr key={p.id}>
                  <td>{p.description ?? "תשלום"}</td>
                  <td style={{ color: "#6b7280" }}>{p.tenant_name ?? "—"}</td>
                  <td style={{ fontWeight: "700", fontFamily: "monospace" }}>₪{(p.amount ?? 0).toLocaleString("he-IL")}</td>
                  <td>
                    <span className={`badge ${p.status === "paid" ? "badge-green" : p.status === "failed" ? "badge-red" : "badge-yellow"}`}>
                      {PAY_HE[p.status] ?? p.status}
                    </span>
                  </td>
                  <td style={{ color: "#6b7280" }}>{new Date(p.created_at).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: "10px", display: "flex", gap: "24px", justifyContent: "flex-end", fontSize: "13px" }}>
            <span>סה״כ שולם: <strong style={{ color: "#16a34a" }}>₪{paidTotal.toLocaleString("he-IL")}</strong></span>
            <span>חוב פתוח: <strong style={{ color: pendingTotal > 0 ? "#dc2626" : "#374151" }}>₪{pendingTotal.toLocaleString("he-IL")}</strong></span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#9ca3af" }}>
          <span>blocpanel — ניהול בניינים</span>
          <span>דוח נוצר: {today}</span>
        </div>
      </div>
    </>
  );
}
