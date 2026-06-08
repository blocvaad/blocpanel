"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TenantStatusActions({ tenantId, currentStatus }: { tenantId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const router = useRouter();

  async function update(status: string) {
    setLoading(true); setMsg(null);
    const res = await fetch(`/api/tenants/${tenantId}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_status: status }),
    });
    if (res.ok) {
      setMsg({ text: "✓ עודכן", ok: true });
      setTimeout(() => router.refresh(), 500);
    } else {
      const j = await res.json();
      setMsg({ text: j.error ?? "שגיאה", ok: false });
    }
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      {currentStatus === "pending" && (
        <button onClick={() => update("approved")} disabled={loading}
          style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", background: "#22c55e20", color: "var(--green)", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
          ✓ אשר דייר
        </button>
      )}
      {currentStatus !== "blocked" ? (
        <button onClick={() => update("blocked")} disabled={loading}
          style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", background: "#ef444420", color: "var(--red)", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
          ✗ חסום דייר
        </button>
      ) : (
        <button onClick={() => update("approved")} disabled={loading}
          style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "none", background: "#22c55e20", color: "var(--green)", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
          ↑ שחרר חסימה
        </button>
      )}
      {msg && <span style={{ fontSize: "13px", color: msg.ok ? "var(--green)" : "var(--red)", fontWeight: "500" }}>{msg.text}</span>}
    </div>
  );
}
