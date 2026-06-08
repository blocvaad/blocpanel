"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border-2)", borderRadius: "8px", padding: "10px 14px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
        ₪{(payload[0].value).toLocaleString("he-IL")}
      </div>
    </div>
  );
}

export default function RevenueChart({ data }: { data: { month: string; amount: number }[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>הכנסות</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>6 חודשים אחרונים</div>
        </div>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--green)", letterSpacing: "-.03em" }}>
            ₪{(total).toLocaleString("he-IL")}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>סה״כ</div>
        </div>
      </div>
      {data.length === 0 ? (
        <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "14px" }}>
          אין נתוני הכנסות
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${v.toLocaleString()}`} />
            <Tooltip content={<Tip />} cursor={{ fill: "#ffffff05", radius: 4 }} />
            <Bar dataKey="amount" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
