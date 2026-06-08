import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import SecurityClient from "@/components/ui/SecurityClient";
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getSession();
  const { data: admin } = await adminClient
    .from("panel_admins")
    .select("last_login, last_2fa, created_at")
    .eq("id", session!.id)
    .single();

  const { data: logs } = await adminClient
    .from("panel_audit_logs")
    .select("action, created_at, ip_address")
    .eq("admin_email", session!.email)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "560px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>אבטחה</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>הגדרות אבטחה וניהול סשן</p>
      </div>

      {/* Session info */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "14px" }}>סשן נוכחי</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "מחובר כ", value: session?.email ?? "" },
            { label: "הרשאה", value: session?.role ?? "" },
            { label: "כניסה אחרונה", value: admin?.last_login ? new Date(admin.last_login).toLocaleString("he-IL") : "—" },
            { label: "2FA אחרון", value: admin?.last_2fa ? new Date(admin.last_2fa).toLocaleString("he-IL") : "לא בוצע" },
            { label: "timeout", value: "30 דקות חוסר פעילות" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>{item.label}</span>
              <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "var(--mono)" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2FA */}
      <SecurityClient />

      {/* IP Whitelist info */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>IP Whitelist</div>
        <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.6, marginBottom: "12px" }}>
          הגבלת גישה לפי IP — הגדר משתנה סביבה <code style={{ background: "var(--surface)", padding: "1px 6px", borderRadius: "4px", fontFamily: "var(--mono)", fontSize: "12px" }}>ALLOWED_IPS</code> ב-Vercel.
        </div>
        <div style={{ background: "var(--surface)", borderRadius: "8px", padding: "12px 14px", fontFamily: "var(--mono)", fontSize: "12px", color: "var(--blue)" }}>
          ALLOWED_IPS=1.2.3.4,5.6.7.8
        </div>
      </div>

      {/* Recent activity */}
      {(logs ?? []).length > 0 && (
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "14px" }}>פעילות אחרונה שלך</div>
          {(logs ?? []).map(log => (
            <div key={log.created_at} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{log.action}</span>
              <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{new Date(log.created_at).toLocaleDateString("he-IL")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
