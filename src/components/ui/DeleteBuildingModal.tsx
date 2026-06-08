"use client";
import { useState } from "react";
import { Archive, X } from "lucide-react";

interface Props {
  buildingName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const REASONS = [
  "בניין עבר לניהול עצמאי",
  "חוזה הסתיים",
  "בקשת הדיירים",
  "בעיה טכנית",
  "אחר",
];

export default function DeleteBuildingModal({ buildingName, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const match = typed === buildingName;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
    }} onClick={onCancel}>
      <div style={{
        width: "100%", maxWidth: "400px",
        background: "var(--surface)", border: "1px solid #eab30840",
        borderRadius: "16px", padding: "24px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: "#eab30820", border: "1px solid #eab30840", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Archive size={22} color="#eab308" />
            </div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "var(--text)" }}>ארכיב בניין</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>נתונים נשמרים לפי GDPR</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px" }}><X size={18} /></button>
        </div>

        {/* Info */}
        <div style={{ background: "#eab30812", border: "1px solid #eab30830", borderRadius: "8px", padding: "12px 14px", marginBottom: "18px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
          הבניין <strong style={{ color: "var(--text)" }}>"{buildingName}"</strong> יועבר לארכיב.<br />
          כל הדיירים יחסמו, אך <strong>כל הנתונים נשמרים</strong> לפי חוק שמירת מסמכים.
          <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-3)" }}>
            לשחזור בעתיד — פנה לתמיכה טכנית
          </div>
        </div>

        {/* Reason */}
        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>סיבת הארכיב</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {REASONS.map(r => (
              <button key={r} type="button" onClick={() => setReason(r)} style={{
                padding: "10px 14px", borderRadius: "7px", border: `1px solid ${reason === r ? "var(--blue)" : "var(--border)"}`,
                background: reason === r ? "#3b82f610" : "transparent",
                color: reason === r ? "var(--text)" : "var(--text-3)",
                fontSize: "13px", textAlign: "right", cursor: "pointer", transition: "all .15s",
              }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Confirm */}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>
            הקלד את שם הבניין לאישור
          </label>
          <input className="input" value={typed} onChange={e => setTyped(e.target.value)}
            placeholder={buildingName} autoFocus
            style={{ fontSize: "15px", height: "46px", borderColor: typed.length > 0 ? (match ? "#22c55e" : "#ef444440") : "var(--border)" }} />
          {typed.length > 0 && !match && (
            <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "6px" }}>השם לא תואם</div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer" }}>ביטול</button>
          <button onClick={() => onConfirm(reason)} disabled={!match} style={{
            flex: 1, padding: "12px", borderRadius: "8px", border: "none",
            background: match ? "#eab308" : "#eab30820",
            color: match ? "#000" : "#eab30860",
            fontSize: "14px", fontWeight: "700",
            cursor: match ? "pointer" : "not-allowed", transition: "all .2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            <Archive size={16} />
            העבר לארכיב
          </button>
        </div>
      </div>
    </div>
  );
}
