"use client";
import { useState, useEffect } from "react";
import { Shield, Mail } from "lucide-react";

type Step = "password" | "otp";

export default function LoginPage() {
  const [step, setStep]       = useState<Step>("password");
  const [email, setEmail]     = useState("talyohala1@gmail.com");
  const [password, setPassword] = useState("");
  const [otp, setOtp]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "timeout") setUrlError("הסשן פג תוקף — נא להתחבר מחדש");
    if (err === "blocked") setUrlError("החשבון שלך חסום — פנה למנהל המערכת");
    if (err === "building_suspended") setUrlError("הבניין מושהה — פנה למנהל המערכת");
  }, []);

  // Step 1 — password
  async function submitPassword(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json();
      if (res.status === 429) { setError(j.error ?? "יותר מדי ניסיונות — נסה שוב בעוד מעט"); setLoading(false); return; }
      if (!res.ok) { setError(j.error ?? "שגיאה"); setLoading(false); return; }

      // Send OTP
      const r2 = await fetch("/api/auth/2fa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "send" }),
      });
      if (!r2.ok) { setError("שגיאה בשליחת קוד"); setLoading(false); return; }
      setStep("otp");
    } catch { setError("שגיאת חיבור"); }
    setLoading(false);
  }

  // Step 2 — OTP
  async function submitOTP(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "verify", code: otp }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "קוד שגוי"); setLoading(false); return; }
      window.location.replace("/overview");
    } catch { setError("שגיאת חיבור"); }
    setLoading(false);
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "13px 14px", fontSize: "15px",
    color: "var(--text)", outline: "none", fontFamily: "inherit",
    transition: "border-color .15s",
  };

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

        {urlError && (
          <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#ef444418", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)", textAlign: "center", marginBottom: "16px" }}>
            {urlError}
          </div>
        )}
        {step === "password" ? (
          <div className="card" style={{ padding: "28px" }}>
            <form onSubmit={submitPassword} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "7px" }}>אימייל</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@bloc.app"
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "7px" }}>סיסמה</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
              </div>
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: "7px", background: "#ef444415", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)" }}>{error}</div>
              )}
              <button type="submit" disabled={loading} style={{
                padding: "13px", borderRadius: "8px", border: "none",
                background: loading ? "var(--border)" : "var(--text)",
                color: loading ? "var(--text-3)" : "var(--bg)",
                fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer",
                width: "100%",
              }}>
                {loading ? "מתחבר..." : "כניסה"}
              </button>
            </form>
          </div>
        ) : (
          <div className="card" style={{ padding: "28px" }}>
            {/* OTP step */}
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "13px", background: "#3b82f620", border: "1px solid #3b82f640", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <Mail size={24} color="var(--blue)" />
              </div>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "var(--text)", marginBottom: "6px" }}>אימות דו-שלבי</div>
              <div style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.6 }}>
                נשלח קוד 6 ספרות למייל שלך.<br />הקוד תקף ל-10 דקות.
              </div>
            </div>

            <form onSubmit={submitOTP} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6} placeholder="000000" required
                style={{
                  ...inp, fontSize: "28px", fontWeight: "800",
                  textAlign: "center", letterSpacing: ".3em",
                  fontFamily: "var(--mono)", padding: "16px",
                }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"}
              />
              {error && (
                <div style={{ padding: "10px 14px", borderRadius: "7px", background: "#ef444415", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)", textAlign: "center" }}>{error}</div>
              )}
              <button type="submit" disabled={loading || otp.length !== 6} style={{
                padding: "13px", borderRadius: "8px", border: "none",
                background: otp.length === 6 && !loading ? "var(--text)" : "var(--border)",
                color: otp.length === 6 && !loading ? "var(--bg)" : "var(--text-3)",
                fontSize: "15px", fontWeight: "700",
                cursor: otp.length === 6 && !loading ? "pointer" : "not-allowed",
                width: "100%",
              }}>
                {loading ? "מאמת..." : "אמת וכנס"}
              </button>
              <button type="button" onClick={() => { setStep("password"); setOtp(""); setError(""); }} style={{
                padding: "10px", borderRadius: "8px", border: "1px solid var(--border)",
                background: "transparent", color: "var(--text-3)",
                fontSize: "14px", cursor: "pointer", width: "100%",
              }}>
                חזרה
              </button>
            </form>
          </div>
        )}

        {/* Security notice */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "16px" }}>
          <Shield size={12} style={{ color: "var(--text-3)" }} />
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>מוגן ב-2FA · session timeout 30 דקות</span>
        </div>
      </div>
    </div>
  );
}
