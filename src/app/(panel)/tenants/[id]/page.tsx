import { adminClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import TenantStatusActions from "@/components/ui/TenantStatusActions";
export const dynamic = "force-dynamic";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: tenant } = await adminClient
    .from("panel_tenants_view").select("*").eq("id", id).single();
  if (!tenant) notFound();

  const [
    { data: payments },
    { data: tickets },
    { data: logs },
  ] = await Promise.all([
    adminClient.from("panel_payments_view").select("*").eq("building_id", tenant.building_id).order("created_at", { ascending: false }).limit(20),
    adminClient.from("panel_tickets_view").select("*").eq("building_id", tenant.building_id).order("created_at", { ascending: false }).limit(10),
    adminClient.from("panel_audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(10),
  ]);

  // Filter payments for this tenant
  const tenantPayments = (payments ?? []).filter(p => p.tenant_name === tenant.full_name);
  const paidTotal = tenantPayments.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount ?? 0), 0);
  const pendingTotal = tenantPayments.filter(p => p.status === "pending").reduce((s, p) => s + (p.amount ?? 0), 0);

  const STATUS = {
    approved: { label: "מאושר",  bg: "#22c55e18", color: "#22c55e" },
    pending:  { label: "ממתין",  bg: "#eab30818", color: "#eab308" },
    blocked:  { label: "חסום",   bg: "#ef444418", color: "#ef4444" },
    rejected: { label: "נדחה",   bg: "#52525b18", color: "#52525b" },
  } as Record<string, { label: string; bg: string; color: string }>;

  const PSC = {
    paid:     { label: "שולם",  badge: "badge-green" },
    pending:  { label: "ממתין", badge: "badge-yellow" },
    failed:   { label: "נכשל",  badge: "badge-red" },
    cancelled:{ label: "בוטל",  badge: "badge-muted" },
  } as Record<string, { label: string; badge: string }>;

  const AL = {
    BLOCK_TENANT:   { label: "חסימה",   color: "#ef4444" },
    APPROVE_TENANT: { label: "אישור",   color: "#22c55e" },
    UPDATE_TENANT:  { label: "עדכון",   color: "#3b82f6" },
  } as Record<string, { label: string; color: string }>;

  const sc = STATUS[tenant.approval_status] ?? STATUS.pending;
  const ROLE: Record<string, string> = { admin: "מנהל 👑", council: "ועד", tenant: "דייר" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Link href="/tenants" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
        <ArrowRight size={14} />חזרה לדיירים
      </Link>

      {/* Header */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#3b82f620", border: "2px solid #3b82f640", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            {tenant.avatar_url
              ? <img src={tenant.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: "22px", fontWeight: "700", color: "var(--blue)" }}>{tenant.full_name.charAt(0)}</span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>{tenant.full_name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>{tenant.building_name}</span>
              <span className="badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "5px" }}>דירה</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
              {tenant.apartment_display.startsWith("🔒") ? <Lock size={14} /> : tenant.apartment_display}
            </div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "5px" }}>תפקיד</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>{ROLE[tenant.role] ?? tenant.role}</div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "5px" }}>טלפון</div>
            <div style={{ fontSize: "14px", fontFamily: "var(--mono)", color: tenant.phone_masked.startsWith("🔒") ? "var(--text-3)" : "var(--text)" }}>
              {tenant.phone_masked.startsWith("🔒") ? "מוסתר" : tenant.phone_masked}
            </div>
          </div>
          <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "12px 14px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "5px" }}>הצטרף</div>
            <div style={{ fontSize: "13px", fontFamily: "var(--mono)", color: "var(--text-2)" }}>{new Date(tenant.created_at).toLocaleDateString("he-IL")}</div>
          </div>
        </div>

        {/* Actions */}
        <TenantStatusActions tenantId={id} currentStatus={tenant.approval_status} />
      </div>

      {/* Payment summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>שולם</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>₪{paidTotal.toLocaleString("he-IL")}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{tenantPayments.filter(p => p.status === "paid").length} תשלומים</div>
        </div>
        <div className="card" style={{ padding: "18px", borderColor: pendingTotal > 0 ? "#eab30840" : "var(--border)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>ממתין</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: pendingTotal > 0 ? "var(--yellow)" : "var(--text)", letterSpacing: "-.03em" }}>₪{pendingTotal.toLocaleString("he-IL")}</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "4px" }}>{tenantPayments.filter(p => p.status === "pending").length} ממתינים</div>
        </div>
      </div>

      {/* Payments */}
      {tenantPayments.length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>תשלומים</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tenantPayments.map(p => {
              const sc = PSC[p.status] ?? PSC.pending;
              return (
                <div key={p.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>{p.description ?? "תשלום"}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: "2px" }}>{new Date(p.created_at).toLocaleDateString("he-IL")}</div>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)", fontFamily: "var(--mono)" }}>₪{p.amount.toLocaleString("he-IL")}</div>
                  <span className={`badge ${sc.badge}`}>{sc.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit log */}
      {(logs ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: "10px" }}>היסטוריית פעולות</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {(logs ?? []).map(log => {
              const meta = AL[log.action] ?? { label: log.action, color: "var(--text-3)" };
              return (
                <div key={log.id} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ padding: "4px 10px", borderRadius: "6px", background: meta.color + "18", color: meta.color, fontSize: "12px", fontWeight: "600", flexShrink: 0 }}>{meta.label}</span>
                  <span style={{ flex: 1, fontSize: "12px", color: "var(--text-3)" }}>{log.admin_email ?? "system"}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{new Date(log.created_at).toLocaleDateString("he-IL")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
