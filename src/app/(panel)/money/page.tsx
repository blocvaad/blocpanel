"use client";
// בקרת כסף — כל מה שהמערכת בכוונה לא סוגרת לבד, במקום אחד ובסדר חומרה.
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { REVIEW_REASON, type MoneyTile, type Severity } from "@/lib/money";

type Data = {
  tiles: MoneyTile[];
  reviews: { id: string; payment_id: string | null; building_id: string | null; building_name: string | null; reason: string; amount: unknown; provider: unknown; at: string }[];
  staleReports: { id: string; building_id: string; building_name: string | null; amount: number; title: string; created_at: string }[];
  disputes: { id: string; building_id: string; building_name: string | null; supplier_name: string | null; amount: number; dispute_reason: string | null; disputed_at: string | null }[];
  batches: { batch: string; company_name: string | null; rows: number; amount: number; at: string }[];
};

const SEV: Record<Severity, { color: string; Icon: typeof Info }> = {
  critical: { color: "#ef4444", Icon: AlertOctagon },
  warning:  { color: "#eab308", Icon: AlertTriangle },
  info:     { color: "#71717a", Icon: Info },
};
const ils = (n: unknown) => `₪${Number(n ?? 0).toLocaleString("he-IL")}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "—");
const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px" };

export default function MoneyPage() {
  const [data, setData] = useState<Data | null>(null);
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

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "10px" }}>
            {data.tiles.map((t) => {
              const { color, Icon } = SEV[t.severity];
              return (
                <div key={t.key} style={{ ...card, borderColor: t.count && t.severity !== "info" ? color : "var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <Icon size={16} color={color} />
                    <span style={{ fontSize: "13px", fontWeight: 700 }}>{t.title}</span>
                  </div>
                  <div style={{ fontSize: "26px", fontWeight: 800, color: t.count ? color : "var(--text)" }}>{t.count}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "6px", lineHeight: 1.5 }}>{t.hint}</div>
                </div>
              );
            })}
          </div>

          <Section title={`תשלומים מקוונים לבדיקה (${data.reviews.length})`} empty="אין — כל ה-callbacks נסגרו אוטומטית.">
            {data.reviews.map((r) => (
              <Row key={r.id} href={r.building_id ? `/buildings/${r.building_id}` : undefined}
                main={`${r.building_name ?? "בניין לא ידוע"} · ${ils(r.amount)} · ${String(r.provider ?? "")}`}
                sub={REVIEW_REASON[r.reason] ?? r.reason} side={when(r.at)} />
            ))}
          </Section>

          <Section title={`מחלוקות ספקים (${data.disputes.length})`} empty="אין מחלוקות פתוחות.">
            {data.disputes.map((d) => (
              <Row key={d.id} href={`/buildings/${d.building_id}`}
                main={`${d.supplier_name ?? "ספק"} ← ${d.building_name ?? "בניין"} · ${ils(d.amount)}`}
                sub={d.dispute_reason ?? ""} side={when(d.disputed_at)} />
            ))}
          </Section>

          <Section title="דיווחי תשלום שממתינים לוועד יותר משבוע" empty="אין דיווחים תקועים.">
            {data.staleReports.map((p) => (
              <Row key={p.id} href={`/buildings/${p.building_id}`}
                main={`${p.building_name ?? "בניין"} · ${p.title} · ${ils(p.amount)}`} sub="הדייר דיווח ששילם — הוועד לא אישר ולא דחה" side={when(p.created_at)} />
            ))}
          </Section>

          <Section title="ייבואי התאמה אחרונים של חברות ניהול" empty="עוד לא יובא קובץ התאמה.">
            {data.batches.map((b) => (
              <Row key={b.batch} main={`${b.company_name ?? "חברה"} · ${b.rows} תשלומים · ${ils(b.amount)}`} sub={b.batch} side={when(b.at)} />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div style={card}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-3)", marginBottom: "10px" }}>{title}</div>
      {has ? children : <div style={{ fontSize: "13px", color: "var(--text-3)" }}>{empty}</div>}
    </div>
  );
}

function Row({ main, sub, side, href }: { main: string; sub: string; side: string; href?: string }) {
  const body = (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{main}</div>
        {sub && <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{sub}</div>}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)", flexShrink: 0 }}>{side}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{body}</Link> : body;
}
