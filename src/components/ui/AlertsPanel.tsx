import Link from "next/link";
import { Clock, XCircle, AlertTriangle, ChevronLeft, BadgeCheck, Receipt } from "lucide-react";

interface Props {
  /** null — המונים לא נטענו (שני הסוגים שלהם לא ידועים). */
  stats: { pending_approvals?:number; open_tickets?:number } | null;
  /** null בשדה — המונה לא נטען (לא 0). */
  extra?: { pendingReports?: number | null; supplierQueue?: number | null; declined30?: number | null };
}

export const ALERTS_FAILED_TEXT = "ההתראות לא נטענו מ-bloc";
export const ALERTS_MISSING_PREFIX = "לא נטען כרגע:";

// failed_payments מ-panel_stats_view תמיד 0 — אין סטטוס 'failed' ב-payments.
// ההתראות מבוססות על מה שבאמת דורש פעולה. א3-1: מונה שלא נטען — לא 0, ואז גם לא "הכל תקין".
export default function AlertsPanel({ stats, extra }: Props) {
  const known = (v: number | null | undefined) => (v === null ? null : v ?? 0);
  const rows = [
    { value: stats ? stats.pending_approvals ?? 0 : null, icon:Clock,         label:"דיירים ממתינים לאישור",      href:"/tenants",   color:"#eab308" },
    { value: known(extra?.pendingReports),               icon:Receipt,       label:"דיווחי תשלום ממתינים לוועד", href:"/debt",      color:"#eab308" },
    { value: known(extra?.supplierQueue),                icon:BadgeCheck,    label:"ספקים ממתינים לאימות",       href:"/suppliers", color:"#3b82f6" },
    { value: known(extra?.declined30),                   icon:XCircle,       label:"סליקות שנדחו (30 יום)",      href:"/money",     color:"#ef4444" },
    { value: stats ? stats.open_tickets ?? 0 : null,     icon:AlertTriangle, label:"תקלות פתוחות",               href:"/tickets",   color:"#ef4444" },
  ];
  const alerts = rows.filter(a => (a.value ?? 0) > 0);
  const missing = rows.filter(a => a.value === null).map(a => a.label);
  const nothing = missing.length === rows.length;

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>התראות</div>
        {alerts.length > 0 && (
          <span className="badge badge-red">{alerts.length}</span>
        )}
      </div>
      {nothing ? (
        <div data-alerts-failed="" style={{ textAlign: "center", padding: "32px 0", fontSize: "14px", color: "var(--red)" }}>
          {ALERTS_FAILED_TEXT}
        </div>
      ) : alerts.length === 0 && missing.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>✅</div>
          <div style={{ fontSize: "14px", color: "var(--text-3)" }}>הכל תקין</div>
        </div>
      ) : alerts.length === 0 ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {alerts.map(a => (
            <Link key={a.label} href={a.href} style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "14px", borderRadius: "10px",
              background: "var(--surface)", border: `1px solid ${a.color}30`,
              textDecoration: "none", transition: "border-color .15s",
            }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: a.color+"18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <a.icon size={18} color={a.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: "500", color: "var(--text)" }}>{a.label}</div>
                <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "2px" }}>{a.value} פריטים</div>
              </div>
              <ChevronLeft size={16} color="var(--text-3)" />
            </Link>
          ))}
        </div>
      )}
      {!nothing && missing.length > 0 && (
        <div data-alerts-missing="" style={{ fontSize: "13px", color: "var(--red)", marginTop: alerts.length ? "12px" : "0", lineHeight: 1.5 }}>
          {ALERTS_MISSING_PREFIX} {missing.join(" · ")}
        </div>
      )}
    </div>
  );
}
