"use client";
import { Printer, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PrintButton() {
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <button onClick={() => router.back()} style={{
        display: "flex", alignItems: "center", gap: "6px",
        padding: "10px 16px", borderRadius: "8px",
        border: "1px solid #3f3f46", background: "transparent",
        color: "#a1a1aa", fontSize: "14px", cursor: "pointer",
      }}>
        <ArrowRight size={15} />חזרה
      </button>
      <button onClick={() => window.print()} style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "10px 18px", borderRadius: "8px", border: "none",
        background: "white", color: "#09090b",
        fontSize: "14px", fontWeight: "700", cursor: "pointer",
      }}>
        <Printer size={16} />הדפס / שמור PDF
      </button>
    </div>
  );
}
