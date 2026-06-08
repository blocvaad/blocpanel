"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("talyohala1@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email, password }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "שגיאה"); setLoading(false); }
      else window.location.replace("/overview");
    } catch { setError("שגיאת חיבור"); setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--bg)", fontWeight: "800", fontSize: "15px", fontFamily: "var(--mono)" }}>B</span>
            </div>
            <span style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>blocpanel</span>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-3)" }}>גישה מורשית בלבד · כל פעולה נרשמת</p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: "28px" }}>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "7px" }}>אימייל</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@bloc.app" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "7px" }}>סיסמה</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "7px", background: "#ef444415", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)" }}>{error}</div>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: "center", padding: "11px", marginTop: "4px", fontSize: "14px", width: "100%", opacity: loading ? .6 : 1 }}>
              {loading ? "מתחבר..." : "כניסה"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
