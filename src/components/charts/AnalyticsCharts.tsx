"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#06b6d4"];

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border-2)", borderRadius: "8px", padding: "10px 14px" }}>
      <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "4px" }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ fontSize: "14px", fontWeight: "700", color: p.color ?? "var(--text)" }}>{p.value}</div>
      ))}
    </div>
  );
}

const PAYMENT_HE: Record<string, string> = { paid: "שולם", pending: "ממתין", failed: "נכשל", cancelled: "בוטל", pending_approval: "ממתין לאישור", exempt: "פטור" };
const URGENCY_HE: Record<string, string> = { high: "גבוה", medium: "בינוני", low: "נמוך", urgent: "דחוף", critical: "קריטי" };
const STATUS_HE: Record<string, string> = { "פתוח": "פתוח", "בטיפול": "בטיפול", "טופל": "טופל", "סגור": "סגור", open: "פתוח", in_progress: "בטיפול", resolved: "טופל", closed: "סגור" };

interface Props {
  buildingStats: { name: string; tenant_count: number; open_tickets: number }[];
  paymentCounts: Record<string, number>;
  ticketByUrgency: Record<string, number>;
  ticketByStatus: Record<string, number>;
  growthByMonth: Record<string, number>;
}

export default function AnalyticsCharts({ buildingStats, paymentCounts, ticketByUrgency, ticketByStatus, growthByMonth }: Props) {
  const paymentPie = Object.entries(paymentCounts)
    .filter(([,v]) => v > 0)
    .map(([k, v]) => ({ name: PAYMENT_HE[k] ?? k, value: v }));

  const urgencyBar = Object.entries(ticketByUrgency)
    .map(([k, v]) => ({ name: URGENCY_HE[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);

  const statusBar = Object.entries(ticketByStatus)
    .map(([k, v]) => ({ name: STATUS_HE[k] ?? k, value: v }));

  const growthLine = Object.entries(growthByMonth)
    .map(([month, count]) => ({ month, count }));

  const chartCard = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "20px" };
  const chartTitle = { fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" };
  const chartSub   = { fontSize: "12px", color: "var(--text-3)", marginBottom: "18px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Building sizes - horizontal bar */}
      <div style={chartCard}>
        <div style={chartTitle}>דיירים לפי בניין</div>
        <div style={chartSub}>Top 10 בניינים</div>
        {buildingStats.length === 0 ? (
          <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>אין נתונים</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, buildingStats.length * 44)}>
            <BarChart data={buildingStats} layout="vertical" margin={{ right: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#27272a" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<Tip />} cursor={{ fill: "#ffffff05" }} />
              <Bar dataKey="tenant_count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="דיירים" maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Payment distribution - pie */}
      <div style={chartCard}>
        <div style={chartTitle}>התפלגות תשלומים</div>
        <div style={chartSub}>לפי סטטוס</div>
        {paymentPie.length === 0 ? (
          <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>אין נתונים</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={paymentPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={2}>
                  {paymentPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<Tip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginTop: "8px" }}>
              {paymentPie.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-2)" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[i % COLORS.length] }} />
                  {item.name} ({item.value})
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ticket urgency */}
      <div style={chartCard}>
        <div style={chartTitle}>תקלות לפי דחיפות</div>
        <div style={chartSub}>התפלגות עדיפויות</div>
        {urgencyBar.length === 0 ? (
          <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>אין תקלות</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={urgencyBar} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: "#ffffff05" }} />
              <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} name="תקלות" maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ticket status */}
      <div style={chartCard}>
        <div style={chartTitle}>תקלות לפי סטטוס</div>
        <div style={chartSub}>מצב טיפול עדכני</div>
        {statusBar.length === 0 ? (
          <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>אין תקלות</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {statusBar.map((s, i) => {
              const max = Math.max(...statusBar.map(x => x.value));
              const pct = max > 0 ? (s.value / max) * 100 : 0;
              const colors: Record<string, string> = { "פתוח": "#ef4444", open: "#ef4444", "בטיפול": "#3b82f6", in_progress: "#3b82f6", "טופל": "#22c55e", resolved: "#22c55e", "סגור": "#52525b", closed: "#52525b" };
              const c = colors[s.name] ?? "#3b82f6";
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-2)" }}>{s.name}</span>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text)", fontFamily: "var(--mono)" }}>{s.value}</span>
                  </div>
                  <div style={{ height: "8px", background: "var(--surface)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: "99px", transition: "width .5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tenant growth */}
      <div style={chartCard}>
        <div style={chartTitle}>גידול דיירים</div>
        <div style={chartSub}>6 חודשים אחרונים</div>
        {growthLine.length === 0 ? (
          <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px" }}>אין נתונים</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={growthLine} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} />
              <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2.5}
                dot={{ fill: "#22c55e", r: 4, strokeWidth: 0 }} name="דיירים חדשים" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
