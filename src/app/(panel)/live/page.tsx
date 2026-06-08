"use client";
import LiveDashboard from "@/components/ui/LiveDashboard";

export default function LivePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>
          לוח מחוונים חי
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
          אירועים בזמן אמת — דיירים, תקלות, תשלומים
        </p>
      </div>
      <LiveDashboard />
    </div>
  );
}
