import { getSession } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import CreateAdminForm from "@/components/ui/CreateAdminForm";
import AdminsManager from "@/components/ui/AdminsManager";
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

      <div className="card" style={{ padding: "20px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "14px" }}>מנהלי פנאל</h2>
        <AdminsManager admins={admins ?? []} currentId={session?.id ?? ""} isSuperAdmin={session?.role === "superadmin"} />
      </div>

      {session?.role === "superadmin" && (
        <div className="card" style={{ padding: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>הוסף מנהל</h2>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "16px" }}>רק superadmin יכול להוסיף מנהלים חדשים</p>
          <CreateAdminForm />
        </div>
      )}

      <div className="card" style={{ padding: "20px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "14px" }}>גיבוי נתונים</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "ספק", value: "Supabase" },
            { label: "גיבוי אוטומטי", value: "כל 24 שעות" },
            { label: "שמירת גיבויים", value: "7 ימים אחורה" },
            { label: "Point-in-time recovery", value: "זמין בתוכנית Pro" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "13px", color: "var(--text-3)" }}>{item.label}</span>
              <span style={{ fontSize: "13px", color: "var(--text-2)" }}>{item.value}</span>
            </div>
          ))}
        </div>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", marginTop: "14px", fontSize: "13px", color: "var(--blue)", textDecoration: "none" }}>
          פתח Supabase Dashboard
        </a>
      </div>

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
              <span style={{ fontSize: "13px", fontWeight: "500", fontFamily: item.mono ? "var(--mono)" : "inherit", color: (item as any).color ?? "var(--text-2)" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
