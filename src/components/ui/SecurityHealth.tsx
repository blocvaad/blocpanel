"use client";
// בריאות אבטחת ה-DB — בדיקה חיה של 119–125 (panel_security_health).
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { HEALTH_CHECKS, type HealthRow } from "@/lib/securityHealth";

type Resp = { available: boolean; rows: HealthRow[]; summary: { ok: number; failed: number; knownOpen: number } | null; checkedAt?: string; error?: string };

export default function SecurityHealth() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/security/health", { credentials: "include", cache: "no-store" });
      setData(await r.json());
    } catch { setData({ available: false, rows: [], summary: null, error: "שגיאת רשת" }); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>בריאות אבטחת מסד הנתונים</div>
        <button onClick={load} disabled={loading} style={{ display: "flex", gap: "6px", alignItems: "center", border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 10px", background: "transparent", color: "var(--text-3)", fontSize: "12px", cursor: "pointer" }}>
          <RefreshCw size={12} /> בדיקה
        </button>
      </div>
      {data?.error && <div style={{ fontSize: "13px", color: "var(--red)" }}>{data.error}</div>}
      {data && !data.available && !data.error && (
        <div style={{ fontSize: "13px", color: "var(--text-3)" }}>הבדיקה זמינה אחרי הרצת מיגרציה 125.</div>
      )}
      {data?.summary && (
        <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "10px" }}>
          {data.summary.ok} תקינות · {data.summary.failed} נכשלו · {data.summary.knownOpen} פתוחות וידועות
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {(data?.rows ?? []).map((r) => {
          const meta = HEALTH_CHECKS[r.check_key] ?? { title: r.check_key, fix: "" };
          const Icon = r.ok ? CheckCircle2 : meta.known ? AlertTriangle : XCircle;
          const color = r.ok ? "var(--green)" : meta.known ? "var(--yellow)" : "var(--red)";
          return (
            <div key={r.check_key} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{meta.title}</div>
                {!r.ok && (
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px", lineHeight: 1.5 }}>
                    {r.detail && <span style={{ fontFamily: "var(--mono)" }}>{r.detail}<br /></span>}
                    {meta.fix}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
