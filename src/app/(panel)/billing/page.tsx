"use client";
// חיוב ומנויים — מבט סופר-אדמין על חיוב הפלטפורמה (בניינים → bloc).
// קריאה בלבד. אין "סמן כשולם": תשלום מאושר רק ע"י PayPlus דרך ה-webhook.
import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { planLabel } from "@/lib/plans";
import { STATUS_LABELS, PAYPLUS_STATE_TEXT, type BillingSummary, type PayPlusEvidence } from "@/lib/billing";

type Sub = {
  id: string; owner_name: string | null; plan_id: string; status: string; amount_ils: number | string;
  founding_price: boolean; current_period_end: string | null; trial_ends_at: string | null;
  past_due_since: string | null; provider_recurring_uid: string | null; provider_cancelled_at: string | null; created_at: string;
};
type Data = {
  payplus: PayPlusEvidence; summary: BillingSummary; subscriptions: Sub[];
  events: { provider: string; event_type: string; status: string; received_at: string }[];
  lastEventAt: string | null; compBuildings: { id: string; name: string; plan: string; comp_reason: string }[];
};

const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "18px" };
const h2: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "var(--text-3)", marginBottom: "12px" };
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "—");
const ils = (n: number | string) => `₪${Number(n).toLocaleString("he-IL")}`;

export default function BillingPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/billing", { credentials: "include", cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setError(j.error ?? "שגיאה"); else setData(j);
    } catch { setError("שגיאת רשת"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (error) return <div dir="rtl" style={{ ...card, color: "var(--red)" }}>{error}</div>;
  if (!data) return <div dir="rtl" style={card}>טוען…</div>;

  const { payplus, summary } = data;
  const stateColor = payplus.state === "working" ? "#22c55e" : payplus.state === "checkout_created" ? "#eab308" : "#71717a";
  const risky = summary.alerts.recurringNotStopped.length;

  return (
    <div dir="rtl" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800 }}>חיוב ומנויים</h1>
        <button onClick={load} disabled={loading} style={{ display: "flex", gap: "6px", alignItems: "center", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
          <RefreshCw size={14}/> רענון
        </button>
      </div>

      <div style={card}>
        <div style={h2}>מצב תשלומים</div>
        <Row
          icon={payplus.state === "working"
            ? <CheckCircle2 size={16} color={stateColor}/>
            : <AlertTriangle size={16} color={stateColor}/>}
          text={PAYPLUS_STATE_TEXT[payplus.state]}
        />
        <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "10px", lineHeight: 1.6 }}>
          אירוע אחרון מ-PayPlus: {payplus.lastEventAt ? new Date(payplus.lastEventAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) : "עוד לא התקבל"}
          <br/>
          דף תשלום אחרון שנוצר: {payplus.lastCheckoutAt ? new Date(payplus.lastCheckoutAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }) : "עוד לא נוצר"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "12px" }}>
        <Kpi label="הכנסה חודשית חוזרת" value={ils(summary.mrr)}/>
        <Kpi label="פעילים" value={summary.counts.active ?? 0}/>
        <Kpi label="בניסיון עם כרטיס" value={summary.counts.trialing ?? 0}/>
        <Kpi label="בפיגור" value={summary.counts.past_due ?? 0} alert={(summary.counts.past_due ?? 0) > 0}/>
        <Kpi label="ממתינים לביטול" value={`${summary.counts.cancel_pending ?? 0} · ${ils(summary.endingRevenue)}`}/>
        <Kpi label="מחיר מייסדים" value={summary.founding}/>
      </div>

      {(risky > 0 || summary.alerts.stuckCheckouts.length > 0 || summary.alerts.pastDue.length > 0) && (
        <div style={{ ...card, borderColor: risky ? "#ef4444" : "var(--border)" }}>
          <div style={h2}>לטיפול</div>
          {risky > 0 && (
            <Row icon={<AlertTriangle size={16} color="#ef4444"/>}
                 text={`${risky} מנויים שבוטלו או הוחלפו, והוראת הקבע לא אושרה כעצורה ב-PayPlus — סיכון לחיוב כפול. לבדוק ב-PayPlus ידנית.`}/>
          )}
          {summary.alerts.stuckCheckouts.length > 0 && (
            <Row icon={<AlertTriangle size={16} color="#eab308"/>} text={`${summary.alerts.stuckCheckouts.length} דפי תשלום פתוחים יותר מיממה`}/>
          )}
          {summary.alerts.pastDue.length > 0 && (
            <Row icon={<AlertTriangle size={16} color="#eab308"/>} text={`${summary.alerts.pastDue.length} בניינים בפיגור תשלום`}/>
          )}
        </div>
      )}

      <div style={card}>
        <div style={h2}>מנויים ({data.subscriptions.length})</div>
        {data.subscriptions.length === 0 ? (
          <div style={{ color: "var(--text-3)", fontSize: "14px" }}>עדיין אין מנויים משלמים.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "var(--text-3)", textAlign: "right" }}>
                  <th style={th}>בניין</th><th style={th}>מסלול</th><th style={th}>סטטוס</th>
                  <th style={th}>סכום</th><th style={th}>חיוב הבא / סיום</th><th style={th}>מייסדים</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>{s.owner_name ?? "—"}</td>
                    <td style={td}>{planLabel(s.plan_id)}</td>
                    <td style={td}>{STATUS_LABELS[s.status] ?? s.status}</td>
                    <td style={td}>{ils(s.amount_ils)}</td>
                    <td style={td}>{fmtDate(s.current_period_end ?? s.trial_ends_at)}</td>
                    <td style={td}>{s.founding_price ? "כן" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={h2}>מנויים ללא תשלום ({data.compBuildings.length})</div>
        {data.compBuildings.length === 0 ? (
          <div style={{ color: "var(--text-3)", fontSize: "14px" }}>אין.</div>
        ) : data.compBuildings.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "13px" }}>
            <span>{b.name} · {planLabel(b.plan)}</span>
            <span style={{ color: "var(--text-3)" }}>{b.comp_reason}</span>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={h2}>אירועים אחרונים מ-PayPlus</div>
        {data.events.length === 0 ? (
          <div style={{ color: "var(--text-3)", fontSize: "14px" }}>עוד לא התקבלו אירועים.</div>
        ) : data.events.map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "12px" }}>
            <span>{e.event_type} · {e.status}</span>
            <span style={{ color: "var(--text-3)" }}>{new Date(e.received_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 6px" };

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "14px", lineHeight: 1.5 }}>{icon}<span>{text}</span></div>;
}

function Kpi({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div style={{ ...card, borderColor: alert ? "#eab308" : "var(--border)" }}>
      <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 800 }}>{value}</div>
    </div>
  );
}
