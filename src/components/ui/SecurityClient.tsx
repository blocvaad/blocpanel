"use client";
import { useState } from "react";
import { Shield, CheckCircle } from "lucide-react";

export default function SecurityClient() {
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");

  async function sendOTP() {
    setLoading(true); setError("");
    const res = await fetch("/api/auth/2fa", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send" }),
    });
    const j = await res.json();
    if (res.ok) { setSent(true); if (j.dev_otp) setDevOtp(j.dev_otp); }
    else setError(j.error ?? "שגיאה");
    setLoading(false);
  }

  async function verifyOTP() {
    setLoading(true); setError("");
    const res = await fetch("/api/auth/2fa", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: otp }),
    });
    const j = await res.json();
    if (res.ok) setVerified(true);
    else setError(j.error ?? "קוד שגוי");
    setLoading(false);
  }

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
        {verified
          ? <CheckCircle size={18} style={{ color: "var(--green)" }} />
          : <Shield size={18} style={{ color: "var(--blue)" }} />
        }
        <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>אימות דו-שלבי (2FA)</span>
      </div>

      {verified ? (
        <div style={{ padding: "14px", borderRadius: "8px", background: "#22c55e18", border: "1px solid #22c55e30", fontSize: "14px", color: "var(--green)", fontWeight: "500", textAlign: "center" }}>
          ✓ אומת בהצלחה
        </div>
      ) : !sent ? (
        <>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px", lineHeight: 1.6 }}>
            שלח קוד חד-פעמי למייל שלך לאימות זהות.
          </p>
          <button onClick={sendOTP} disabled={loading} style={{
            width: "100%", padding: "13px", borderRadius: "8px", border: "none",
            background: "var(--blue)", color: "white", fontSize: "14px", fontWeight: "600", cursor: "pointer",
            opacity: loading ? .6 : 1,
          }}>
            {loading ? "שולח..." : "שלח קוד OTP"}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px" }}>הזן את הקוד שנשלח למייל:</p>
          {devOtp && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#3b82f615", border: "1px solid #3b82f630", fontSize: "13px", color: "var(--blue)", fontFamily: "var(--mono)", marginBottom: "12px", textAlign: "center" }}>
              DEV: {devOtp}
            </div>
          )}
          <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6}
            placeholder="123456" style={{
              width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "8px", padding: "13px", fontSize: "22px", fontWeight: "700",
              color: "var(--text)", outline: "none", fontFamily: "var(--mono)",
              textAlign: "center", letterSpacing: ".2em", marginBottom: "12px",
            }} />
          {error && <div style={{ color: "var(--red)", fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          <button onClick={verifyOTP} disabled={loading || otp.length !== 6} style={{
            width: "100%", padding: "13px", borderRadius: "8px", border: "none",
            background: otp.length === 6 ? "var(--blue)" : "var(--border)",
            color: otp.length === 6 ? "white" : "var(--text-3)",
            fontSize: "14px", fontWeight: "600", cursor: otp.length === 6 ? "pointer" : "not-allowed",
          }}>
            {loading ? "מאמת..." : "אמת"}
          </button>
        </>
      )}
    </div>
  );
}
