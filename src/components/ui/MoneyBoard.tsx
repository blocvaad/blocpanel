// src/components/ui/MoneyBoard.tsx — "בקרת כסף": האריחים והרשימות (מוצג; הטעינה — בעמוד).
// PAY-0: נפרד מהעמוד כדי שיהיה מרונדר בבדיקה עם הצורה המדויקת שה-API מחזיר (design-language §8: נכשל ≠ ריק ≠ טוען).
import Link from "next/link";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { reviewLine, type MoneyTile, type Severity } from "@/lib/money";

export type MoneyData = {
  tiles: MoneyTile[];
  /** null — הקריאה נכשלה. */
  reviews: { id: string; payment_id: string | null; building_id: string | null; building_name: string | null; reason: string; amount: unknown; provider: unknown;
             owed?: unknown; detail?: unknown; kind?: unknown; untrusted?: boolean; at: string }[] | null;
  /** כמה יש בסך הכול (הרשימה עד 50). */
  reviewTotal?: number | null;
  /** PAY-0: null — הקריאה נכשלה (לא "אין"). */
  billingRejected?: { id: string; subscription_id: string | null; reason: string | null; label: string; amount: number | null; at: string }[] | null;
  billingRejectedTotal?: number | null;
  staleReports: { id: string; building_id: string; building_name: string | null; amount: number; title: string; created_at: string }[];
  /** LEDGER-1b: רק על רשומה חיה; null — הקריאה נכשלה (לא "אין"). */
  disputes: { id: string; building_id: string; building_name: string | null; supplier_name: string | null; amount: number; dispute_reason: string | null; disputed_at: string | null }[] | null;
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
const failedLine: React.CSSProperties = { ...card, color: "var(--red)", fontSize: "13px" };

export default function MoneyBoard({ data }: { data: MoneyData }) {
  const reviewCount = data.reviewTotal ?? data.reviews?.length ?? 0;
  const rejectedCount = data.billingRejectedTotal ?? data.billingRejected?.length ?? 0;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "10px" }}>
        {data.tiles.map((t) => {
          const { color, Icon } = SEV[t.severity];
          return (
            <div key={t.key} data-money-tile={t.key} style={{ ...card, borderColor: (t.count === null || t.count) && t.severity !== "info" ? color : "var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <Icon size={16} color={color} />
                <span style={{ fontSize: "13px", fontWeight: 700 }}>{t.title}</span>
              </div>
              <div style={{ fontSize: "26px", fontWeight: 800, color: t.count ? color : "var(--text)" }}>{t.count === null ? "—" : t.count}</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "6px", lineHeight: 1.5 }}>{t.hint}</div>
            </div>
          );
        })}
      </div>

      {data.reviews === null ? (
        <div style={failedLine} data-money-failed="reviews">תשלומים מקוונים לבדיקה — הקריאה נכשלה. נסו לרענן.</div>
      ) : (
        <Section title={`תשלומים מקוונים לבדיקה (${reviewCount})`} empty="אין — כל ה-callbacks נסגרו אוטומטית.">
          {data.reviews.map((r) => (
            <Row key={r.id} href={r.building_id ? `/buildings/${r.building_id}` : undefined}
              main={`${r.building_name ?? "בניין לא ידוע"} · ${ils(r.amount)} · ${String(r.provider ?? "")}`}
              sub={`${reviewLine(r)}${r.untrusted ? " · לא אומת מול הספק (בלי אסימון)" : ""}`} side={when(r.at)} />
          ))}
        </Section>
      )}

      {data.billingRejected === null ? (
        <div style={failedLine} data-money-failed="billing">חיובי מנוי שנדחו — הקריאה נכשלה. נסו לרענן.</div>
      ) : (
        <Section title={`חיובי מנוי ל-bloc שנדחו (${rejectedCount})`} empty="אין — כל חיובי המנוי שהגיעו הוחלו.">
          {(data.billingRejected ?? []).map((e) => (
            <Row key={e.id} href="/billing"
              main={`${e.label}${e.amount != null ? ` · ${ils(e.amount)}` : ""}`}
              sub={e.subscription_id ? `מנוי ${e.subscription_id.slice(0, 8)}` : "בלי מנוי מזוהה"} side={when(e.at)} />
          ))}
        </Section>
      )}

      {data.disputes === null ? (
        <div style={failedLine} data-money-failed="disputes">מחלוקות ספקים — הקריאה נכשלה. נסו לרענן.</div>
      ) : (
        <Section title={`מחלוקות ספקים (${data.disputes.length})`} empty="אין מחלוקות פתוחות.">
          {data.disputes.map((d) => (
            <Row key={d.id} href={`/buildings/${d.building_id}`}
              main={`${d.supplier_name ?? "ספק"} ← ${d.building_name ?? "בניין"} · ${ils(d.amount)}`}
              sub={d.dispute_reason ?? ""} side={when(d.disputed_at)} />
          ))}
        </Section>
      )}

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
