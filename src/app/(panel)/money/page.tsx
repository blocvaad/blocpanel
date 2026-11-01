"use client";
// בקרת כסף — כל מה שהמערכת בכוונה לא סוגרת לבד, במקום אחד ובסדר חומרה.
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import MoneyBoard, { type MoneyData } from "@/components/ui/MoneyBoard";

const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" };

export default function MoneyPage() {
  const [data, setData] = useState<MoneyData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/money", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "שגיאה"); else setData(j);
    } catch { setError("שגיאת רשת"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800 }}>בקרת כסף</h1>
          <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>מה שהמערכת לא סוגרת לבד — ודורש החלטה של אדם</p>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", gap: "6px", alignItems: "center", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
          <RefreshCw size={14} /> רענון
        </button>
      </div>

      {error && <div style={{ ...card, color: "var(--red)" }}>{error}</div>}
      {!data && !error && <div style={card}>טוען…</div>}

      {data && <MoneyBoard data={data} />}
    </div>
  );
}
