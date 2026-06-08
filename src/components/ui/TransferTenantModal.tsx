"use client";
import { useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Building { id: string; name: string; }
interface Props {
  tenantId: string;
  tenantName: string;
  currentBuildingId: string;
  buildings: Building[];
  onClose: () => void;
}

export default function TransferTenantModal({ tenantId, tenantName, currentBuildingId, buildings, onClose }: Props) {
  const [targetId, setTargetId] = useState("");
  const [apartment, setApartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const available = buildings.filter(b => b.id !== currentBuildingId);

  async function handleTransfer() {
    if (!targetId) return;
    setLoading(true); setError("");
    const res = await fetch("/api/tenants/transfer", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, to_building_id: targetId, new_apartment: apartment || undefined }),
    });
    if (res.ok) { router.push("/tenants"); onClose(); }
    else { const j = await res.json(); setError(j.error ?? "שגיאה"); }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: "380px", background: "var(--surface)", border: "1px solid #3b82f630", borderRadius: "16px", padding: "24px", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: "#3b82f620", border: "1px solid #3b82f640", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeftRight size={20} color="var(--blue)" />
            </div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "var(--text)" }}>העברת דייר</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{tenantName}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer" }}><X size={18} /></button>
        </div>

        <div style={{ background: "#eab30812", border: "1px solid #eab30830", borderRadius: "8px", padding: "12px 14px", marginBottom: "18px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
          הדייר יועבר לבניין החדש עם סטטוס <strong>ממתין לאישור</strong> עד שמנהל הבניין יאשר.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>בניין יעד *</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "13px 14px", fontSize: "15px", color: "var(--text)", outline: "none", fontFamily: "inherit" }}>
              <option value="">בחר בניין...</option>
              {available.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>דירה חדשה (אופציונלי)</label>
            <input value={apartment} onChange={e => setApartment(e.target.value)}
              placeholder="מספר דירה"
              style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "13px 14px", fontSize: "15px", color: "var(--text)", outline: "none", fontFamily: "inherit" }} />
          </div>
        </div>

        {error && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#ef444418", color: "var(--red)", fontSize: "13px", marginBottom: "14px" }}>{error}</div>}

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "13px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer" }}>ביטול</button>
          <button onClick={handleTransfer} disabled={!targetId || loading}
            style={{ flex: 2, padding: "13px", borderRadius: "8px", border: "none", background: targetId && !loading ? "var(--blue)" : "var(--border)", color: targetId && !loading ? "white" : "var(--text-3)", fontSize: "14px", fontWeight: "700", cursor: targetId && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <ArrowLeftRight size={16} />
            {loading ? "מעביר..." : "העבר"}
          </button>
        </div>
      </div>
    </div>
  );
}
