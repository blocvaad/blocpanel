"use client";
// חובות לפי בניין. "חוב" = מה ש-bloc יודע שלא שולם: ממתין לתשלום + דווח וממתין
// לאישור הוועד. גבייה דרך חברת ניהול (external_pending) מוצגת בנפרד — bloc לא
// יודע אם שולם עד שהחברה מייבאת התאמה, ולכן זה לא חוב.
import { useEffect, useState } from "react";
import { Building2, AlertCircle, Clock } from "lucide-react";
import Link from "next/link";

interface DebtRow {
  building_id: string; building_name: string;
  open_count: number; open_amount: number;
  approval_count: number; approval_amount: number;
  external_count: number; external_amount: number;
  oldest_open: string | null;
}

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

export default function DebtPage() {
  const [data, setData] = useState<DebtRow[]>([]);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/debt", { credentials: "include", cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => {
        if (!ok) setError(j.error ?? "שגיאה");
        else { setData(j.data ?? []); setPartial(!!j.partial); }
        setLoading(false);
      })
      .catch(() => { setError("שגיאת רשת"); setLoading(false); });
  }, []);

  const debt = data.filter((r) => r.open_count + r.approval_count > 0);
  const debtTotal = debt.reduce((s, r) => s + r.open_amount + r.approval_amount, 0);
  const debtCount = debt.reduce((s, r) => s + r.open_count + r.approval_count, 0);
  const approvalCount = data.reduce((s, r) => s + r.approval_count, 0);
  const external = data.filter((r) => r.external_count > 0);
  const externalTotal = external.reduce((s, r) => s + r.external_amount, 0);
  const maxDebt = Math.max(...debt.map((r) => r.open_amount + r.approval_amount), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>חובות</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>חיובים פתוחים לפי בניין — מחושב במסד הנתונים</p>
      </div>

      {error && <div className="card" style={{ padding: "16px", color: "var(--red)" }}>{error}</div>}
      {partial && (
        <div className="card" style={{ padding: "12px 16px", fontSize: "13px", color: "var(--yellow)" }}>
          מיגרציה 125 עוד לא רצה — הסכומים מחושבים מ-1000 חיובים לכל היותר ועשויים להיות חלקיים.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }}>
        <Kpi label="חוב פתוח" value={ils(debtTotal)} color={debtTotal > 0 ? "var(--red)" : "var(--green)"} />
        <Kpi label="חיובים פתוחים" value={String(debtCount)} color="var(--yellow)" />
        <Kpi label="דיווחים שממתינים לוועד" value={String(approvalCount)} color={approvalCount > 0 ? "var(--yellow)" : "var(--text)"} />
        <Kpi label="בגבייה חיצונית" value={ils(externalTotal)} color="var(--text-2)" />
      </div>

      {loading ? (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>טוען...</div>
      ) : debt.length === 0 ? (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text-2)", marginBottom: "6px" }}>אין חובות פתוחים</div>
          <div style={{ fontSize: "13px", color: "var(--text-3)" }}>כל החיובים שבאחריות bloc שולמו או נסגרו</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {debt.map((row, i) => {
            const total = row.open_amount + row.approval_amount;
            const pct = (total / maxDebt) * 100;
            const isTop = i === 0;
            const age = daysAgo(row.oldest_open);
            return (
              <Link key={row.building_id} href={`/buildings/${row.building_id}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: "18px", borderColor: isTop ? "#ef444440" : "var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: isTop ? "#ef444418" : "var(--surface)", border: `1px solid ${isTop ? "#ef444430" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isTop ? <AlertCircle size={18} color="#ef4444" /> : <Building2 size={18} color="var(--text-3)" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)", marginBottom: "2px" }}>{row.building_name}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-3)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span>{row.open_count} ממתינים לתשלום</span>
                        {row.approval_count > 0 && <span>{row.approval_count} דווחו וממתינים לוועד</span>}
                        {age !== null && age > 30 && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--yellow)" }}><Clock size={12} />הוותיק ביותר: {age} ימים</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: "20px", fontWeight: "700", color: isTop ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)" }}>{ils(total)}</div>
                      {debtTotal > 0 && <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>{Math.round((total / debtTotal) * 100)}% מסה״כ</div>}
                    </div>
                  </div>
                  <div style={{ height: "6px", background: "var(--surface)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: isTop ? "var(--red)" : "var(--yellow)", borderRadius: "99px" }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {external.length > 0 && (
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>גבייה דרך חברת ניהול</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "12px" }}>
            לא חוב: החברה גובה בעצמה ומעדכנת ב-bloc בייבוא התאמה. ערך גבוה ולא מתעדכן = החברה לא מייבאת.
          </div>
          {external.map((r) => (
            <Link key={r.building_id} href={`/buildings/${r.building_id}`} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13px", color: "var(--text)", textDecoration: "none" }}>
              <span>{r.building_name}</span>
              <span style={{ fontFamily: "var(--mono)", color: "var(--text-2)" }}>{r.external_count} · {ils(r.external_amount)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: "18px" }}>
      <div style={{ fontSize: "11px", color: "var(--text-3)", letterSpacing: ".07em", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: "700", color, letterSpacing: "-.03em" }}>{value}</div>
    </div>
  );
}
