"use client";
import { useState } from "react";

export default function CreateAdminForm() {
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "admin" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok"|"err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setMsg(null);
    const res = await fetch("/api/settings/create-admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json(); setLoading(false);
    if (res.ok) {
      setMsg({ type: "ok", text: "✓ המנהל נוצר בהצלחה" });
      setForm({ email: "", full_name: "", password: "", role: "admin" });
    } else {
      setMsg({ type: "err", text: json.error ?? "שגיאה" });
    }
  }

  const inputStyle = {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "12px 14px", fontSize: "15px",
    color: "var(--text)", outline: "none", fontFamily: "inherit",
  };
  const labelStyle = {
    display: "block", fontSize: "12px", fontWeight: "600",
    color: "var(--text-3)", textTransform: "uppercase" as const,
    letterSpacing: ".06em", marginBottom: "7px",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>שם מלא</label>
          <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
            required placeholder="ישראל ישראלי" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>אימייל</label>
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            required placeholder="admin@bloc.app" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>סיסמה</label>
          <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            required minLength={8} placeholder="לפחות 8 תווים" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>תפקיד</label>
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="viewer">viewer — צפייה</option>
            <option value="admin">admin — ניהול</option>
            <option value="superadmin">superadmin — הכל</option>
          </select>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", fontSize: "14px", fontWeight: "500",
          background: msg.type === "ok" ? "#22c55e18" : "#ef444418",
          color: msg.type === "ok" ? "var(--green)" : "var(--red)",
          border: `1px solid ${msg.type === "ok" ? "#22c55e30" : "#ef444430"}`,
        }}>{msg.text}</div>
      )}

      <button type="submit" disabled={loading} style={{
        padding: "13px", borderRadius: "8px", border: "none",
        background: loading ? "var(--border)" : "var(--text)",
        color: loading ? "var(--text-3)" : "var(--bg)",
        fontSize: "15px", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer",
      }}>
        {loading ? "יוצר..." : "צור מנהל"}
      </button>
    </form>
  );
}
