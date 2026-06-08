"use client";
import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  buildingName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteBuildingModal({ buildingName, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const match = typed === buildingName;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(4px)",
    }} onClick={onCancel}>
      <div style={{
        width: "100%", maxWidth: "380px",
        background: "var(--surface)", border: "1px solid #ef444430",
        borderRadius: "16px", padding: "24px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#ef444420", border: "1px solid #ef444440", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={20} color="#ef4444" />
            </div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>השהיית בניין</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>פעולה הפיכה — לא מוחק מה-DB</div>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ background: "#ef444412", border: "1px solid #ef444430", borderRadius: "8px", padding: "12px 14px", marginBottom: "20px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>"{buildingName}"</strong> יושהה — כל הדיירים יחסמו ולא יוכלו להיכנס.<br/><br/>
          <span style={{ color: "var(--text-3)" }}>הנתונים נשמרים. מחיקה מלאה דורשת פעולה ידנית ב-Supabase בלבד.</span>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "8px" }}>
            הקלד את שם הבניין לאישור
          </label>
          <input className="input" value={typed} onChange={e => setTyped(e.target.value)}
            placeholder={buildingName} autoFocus
            style={{ fontSize: "15px", height: "46px", borderColor: typed.length > 0 ? (match ? "#22c55e" : "#ef444440") : "var(--border)" }}
          />
          {typed.length > 0 && !match && (
            <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "6px" }}>השם לא תואם</div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "12px", borderRadius: "8px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer",
          }}>ביטול</button>
          <button onClick={onConfirm} disabled={!match} style={{
            flex: 1, padding: "12px", borderRadius: "8px", border: "none",
            background: match ? "#ef4444" : "#ef444420",
            color: match ? "white" : "#ef444460",
            fontSize: "14px", fontWeight: "600",
            cursor: match ? "pointer" : "not-allowed", transition: "all .2s",
          }}>השהה בניין</button>
        </div>
      </div>
    </div>
  );
}
