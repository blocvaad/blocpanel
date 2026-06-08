"use client";
import { useState } from "react";
import { PauseCircle, PlayCircle, X } from "lucide-react";

interface Props {
  buildingName: string;
  isActive: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SuspendBuildingModal({ buildingName, isActive, onConfirm, onCancel }: Props) {
  const suspending = isActive;
  const color = suspending ? "#f97316" : "#22c55e";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
    }} onClick={onCancel}>
      <div style={{
        width: "100%", maxWidth: "380px",
        background: "var(--surface)", border: `1px solid ${color}30`,
        borderRadius: "16px", padding: "24px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: color + "20", border: `1px solid ${color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {suspending
                ? <PauseCircle size={22} color={color} />
                : <PlayCircle size={22} color={color} />
              }
            </div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "var(--text)" }}>
                {suspending ? "השהיית בניין" : "הפעלת בניין"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                {suspending ? "דיירים לא יוכלו להתחבר" : "דיירים יוכלו להתחבר מחדש"}
              </div>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "4px" }}>
            <X size={18} />
          </button>
        </div>

        {/* Info */}
        <div style={{ background: color + "12", border: `1px solid ${color}30`, borderRadius: "10px", padding: "14px 16px", marginBottom: "20px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.7 }}>
          {suspending ? (
            <>
              השהיית <strong style={{ color: "var(--text)" }}>"{buildingName}"</strong> תחסום את כניסת כל הדיירים לאפליקציה באופן מיידי.<br />
              <span style={{ color: "var(--text-3)", fontSize: "12px" }}>הנתונים נשמרים. ניתן להפעיל מחדש בכל עת.</span>
            </>
          ) : (
            <>
              הפעלת <strong style={{ color: "var(--text)" }}>"{buildingName}"</strong> תאפשר לכל הדיירים המאושרים להתחבר מחדש.
            </>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "13px", borderRadius: "8px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer",
          }}>ביטול</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "13px", borderRadius: "8px", border: "none",
            background: color, color: suspending ? "white" : "var(--bg)",
            fontSize: "14px", fontWeight: "700", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {suspending ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
            {suspending ? "השהה" : "הפעל"}
          </button>
        </div>
      </div>
    </div>
  );
}
