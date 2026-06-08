"use client";
import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 5 * 60 * 1000;  // warn 5 min before

export default function SessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function reset() {
    setShowWarning(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warnRef.current)  clearTimeout(warnRef.current);
    if (countRef.current) clearInterval(countRef.current);

    warnRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemaining(WARNING_MS / 1000);
      countRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) { logout(); return 0; }
          return r - 1;
        });
      }, 1000);
    }, TIMEOUT_MS - WARNING_MS);

    timerRef.current = setTimeout(logout, TIMEOUT_MS);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login?error=timeout";
  }

  useEffect(() => {
    reset();
    const events = ["mousedown","keydown","touchstart","scroll"];
    events.forEach(e => document.addEventListener(e, reset, { passive: true }));
    return () => {
      events.forEach(e => document.removeEventListener(e, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warnRef.current)  clearTimeout(warnRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  if (!showWarning) return null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "100%", maxWidth: "360px",
        background: "var(--surface)", border: "1px solid #eab30840",
        borderRadius: "16px", padding: "28px", textAlign: "center",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
      }}>
        <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "#eab30820", border: "1px solid #eab30840", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Clock size={26} color="#eab308" />
        </div>
        <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" }}>
          פג תוקף הסשן בקרוב
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "20px", lineHeight: 1.6 }}>
          תנותק אוטומטית בעוד
        </div>
        <div style={{ fontSize: "48px", fontWeight: "800", color: "#eab308", fontFamily: "var(--mono)", letterSpacing: "-.03em", marginBottom: "24px" }}>
          {String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={logout} style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer" }}>
            התנתק
          </button>
          <button onClick={reset} style={{ flex: 2, padding: "12px", borderRadius: "8px", border: "none", background: "#eab308", color: "#000", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
            המשך סשן
          </button>
        </div>
      </div>
    </div>
  );
}
