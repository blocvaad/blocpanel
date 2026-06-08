"use client";
import { useEffect, useState } from "react";
import { TrendingDown, Building2, AlertCircle } from "lucide-react";
import Link from "next/link";

interface DebtRow {
  building_id: string;
  name: string;
  total: number;
  count: number;
}

export default function DebtPage() {
  const [data, setData] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/debt", { credentials: "include" })
      .then(r => r.json())
      .then(j => { setData(j.data ?? []); setLoading(false); });
  }, []);

  const grandTotal = data.reduce((s, r) => s + r.total, 0);
  const grandCount = data.reduce((s, r) => s + r.count, 0);
  const maxDebt = Math.max(...data.map(r => r.total), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>סטטיסטיקת חובות</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>תשלומים ממתינים ונכשלים לפי בניין</p>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <div className="card" style={{ padding: "18px", borderColor: grandTotal > 0 ? "#ef444440" : "var(--border)" }}>
          {grandTotal > 0 && <div style={{ position: "absolute", top: 0, right: 0, left: 0, height: "2px", background: "linear-gradient(90deg,transparent,#ef4444,transparent)", borderRadius: "12px 12px 0 0" }} />}
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>סה״כ חוב</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: grandTotal > 0 ? "var(--red)" : "var(--green)", letterSpacing: "-.03em" }}>
            ₪{grandTotal.toLocaleString("he-IL")}
          </div>
        </div>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>תשלומים פתוחים</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--yellow)", letterSpacing: "-.03em" }}>{grandCount}</div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>טוען...</div>
      ) : data.length === 0 ? (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>✅</div>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-2)", marginBottom: "6px" }}>אין חובות!</div>
          <div style={{ fontSize: "13px", color: "var(--text-3)" }}>כל התשלומים שולמו</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.map((row, i) => {
            const pct = (row.total / maxDebt) * 100;
            const isTop = i === 0;
            return (
              <Link key={row.building_id} href={`/buildings/${row.building_id}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: "18px", borderColor: isTop ? "#ef444440" : "var(--border)", transition: "border-color .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: isTop ? "#ef444418" : "var(--surface)", border: `1px solid ${isTop ? "#ef444430" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isTop ? <AlertCircle size={18} color="#ef4444" /> : <Building2 size={18} color="var(--text-3)" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)", marginBottom: "2px" }}>{row.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-3)" }}>{row.count} תשלומים פתוחים</div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: "20px", fontWeight: "700", color: isTop ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)", letterSpacing: "-.02em" }}>
                        ₪{row.total.toLocaleString("he-IL")}
                      </div>
                      {grandTotal > 0 && (
                        <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", textAlign: "left" }}>
                          {Math.round((row.total / grandTotal) * 100)}% מסה״כ
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: "6px", background: "var(--surface)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: isTop ? "var(--red)" : "var(--yellow)",
                      borderRadius: "99px", transition: "width .5s ease",
                    }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
