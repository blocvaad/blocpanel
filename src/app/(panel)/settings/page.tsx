import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import CreateAdminForm from "@/components/ui/CreateAdminForm";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const { data: admins } = await adminClient
    .from("panel_admins")
    .select("id,email,full_name,role,is_active,last_login,created_at")
    .order("created_at", { ascending: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "600px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>הגדרות</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>ניהול מנהלי פנאל והגדרות מערכת</p>
      </div>

      {/* Admins */}
      <div className="card" style={{ padding: "20px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "14px" }}>מנהלי פנאל</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(admins ?? []).map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 14px", borderRadius: "8px", background: "var(--surface)",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
                background: "#3b82f620", border: "1px solid #3b82f640",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--blue)" }}>{a.full_name.charAt(0)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>{a.full_name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "1px" }}>{a.email}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="badge badge-muted" style={{ fontFamily: "var(--mono)", fontSize: "11px" }}>{a.role}</span>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: a.is_active ? "var(--green)" : "var(--text-3)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add admin */}
      {session?.role === "superadmin" && (
        <div className="card" style={{ padding: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>הוסף מנהל</h2>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "16px" }}>רק superadmin יכול להוסיף מנהלים חדשים</p>
          <CreateAdminForm />
        </div>
      )}

      {/* System info */}
      <div className="card" style={{ padding: "20px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "14px" }}>מידע מערכת</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "גרסה", value: "blocpanel v1.0", mono: true, color: "var(--blue)" },
            { label: "מחובר כ", value: session?.email ?? "", mono: true },
            { label: "הרשאה", value: session?.role ?? "", mono: true, color: "var(--green)" },
            { label: "סביבה", value: "production", mono: true },
            { label: "כל פעולה", value: "נרשמת ב-audit log" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>{item.label}</span>
              <span style={{
                fontSize: "13px", fontWeight: "500",
                fontFamily: item.mono ? "var(--mono)" : "inherit",
                color: item.color ?? "var(--text-2)",
              }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
