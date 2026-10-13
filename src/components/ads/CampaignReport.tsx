"use client";
// CampaignReport — הדוח של קמפיין בפאנל (bloc ADS-1; החלטה 75): חשיפות, אנשים שונים, הקלקות, CTR וסגירות —
// לפי יום, לפי פרסומת, לפי מסך ולפי עיר. מספרים מצטברים בלבד. גרף רק מ-4 ימים (פחות — המספרים אומרים יותר).
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Download, Printer } from "lucide-react";
import { Section, ghostBtn } from "@/components/ui/panelKit";
import { fmtInt, fmtCtr, SCREEN_LABEL, type AdReport } from "@/lib/ads";

const th: React.CSSProperties = { padding: "9px 12px", textAlign: "right", fontSize: "13px", fontWeight: 600, color: "var(--text-2)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 12px", fontSize: "14.5px", color: "var(--text)", borderBottom: "1px solid var(--border)", fontFamily: "var(--mono)" };

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border-2)", borderRadius: "8px", padding: "10px 14px", direction: "rtl" }}>
      <div style={{ fontSize: "13px", color: "var(--text-2)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>{fmtInt(payload[0].value)} חשיפות</div>
    </div>
  );
}

const dayLabel = (k: string) => { const [, m, d] = k.split("-"); return `${Number(d)}.${Number(m)}`; };

export default function CampaignReport({ campaignId, report, creativeNames }: {
  campaignId: string; report: AdReport; creativeNames: Record<string, string>;
}) {
  const t = report.totals;
  const chart = report.days.map((d) => ({ day: dayLabel(d.day), views: d.views }));
  return (
    <Section title="הדוח" id="report" hint="חשיפה = הפרסומת הוצגה על המסך. אנשים שונים = כמה אנשים ראו אותה לפחות פעם אחת.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <a href={`/api/ads/report?campaign=${campaignId}&format=csv`} style={{ ...ghostBtn, textDecoration: "none" }} data-report-csv=""><Download size={15} />CSV למפרסם</a>
        <Link href={`/ads/campaigns/${campaignId}/report`} style={{ ...ghostBtn, textDecoration: "none" }}><Printer size={15} />דוח להדפסה</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "10px" }} data-report-totals="">
        {[
          { label: "חשיפות", value: fmtInt(t.views) },
          { label: "אנשים שונים", value: fmtInt(t.reach) },
          { label: "הקלקות", value: fmtInt(t.clicks) },
          { label: "CTR", value: fmtCtr(t.views, t.clicks) },
          { label: "סגירות", value: fmtInt(t.closes) },
        ].map((s) => (
          <div key={s.label} style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "13.5px", color: "var(--text-2)" }}>{s.label}</div>
            <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "4px", fontFamily: "var(--mono)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {report.days.length === 0 ? (
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-report-empty="">עוד לא הוצג כלום בקמפיין הזה.</p>
      ) : (
        <>
          {chart.length >= 4 && (
            <div style={{ width: "100%", height: "220px" }} data-report-chart="">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} reversed />
                  <YAxis orientation="right" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="views" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "560px" }} data-report-days="">
              <thead><tr><th style={th}>יום</th><th style={th}>חשיפות</th><th style={th}>אנשים שונים</th><th style={th}>הקלקות</th><th style={th}>CTR</th><th style={th}>סגירות</th></tr></thead>
              <tbody>
                {[...report.days].reverse().map((d) => (
                  <tr key={d.day}>
                    <td style={td}>{d.day.split("-").reverse().join(".")}</td><td style={td}>{fmtInt(d.views)}</td><td style={td}>{fmtInt(d.reach)}</td>
                    <td style={td}>{fmtInt(d.clicks)}</td><td style={td}>{fmtCtr(d.views, d.clicks)}</td><td style={td}>{fmtInt(d.closes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.creatives.length > 1 && (
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }} data-report-creatives="">
                <thead><tr><th style={th}>פרסומת</th><th style={th}>חשיפות</th><th style={th}>הקלקות</th><th style={th}>CTR</th></tr></thead>
                <tbody>
                  {report.creatives.map((c) => (
                    <tr key={c.creative_id}>
                      <td style={{ ...td, fontFamily: "inherit" }}>{creativeNames[c.creative_id] ?? "פרסומת"}</td>
                      <td style={td}>{fmtInt(c.views)}</td><td style={td}>{fmtInt(c.clicks)}</td><td style={td}>{fmtCtr(c.views, c.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "12px" }}>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse" }} data-report-screens="">
                <thead><tr><th style={th}>מסך</th><th style={th}>חשיפות</th><th style={th}>CTR</th></tr></thead>
                <tbody>{report.screens.map((s) => (
                  <tr key={s.screen}><td style={{ ...td, fontFamily: "inherit" }}>{SCREEN_LABEL[s.screen]}</td><td style={td}>{fmtInt(s.views)}</td><td style={td}>{fmtCtr(s.views, s.clicks)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse" }} data-report-cities="">
                <thead><tr><th style={th}>עיר</th><th style={th}>חשיפות</th><th style={th}>CTR</th></tr></thead>
                <tbody>{report.cities.map((c) => (
                  <tr key={c.city ?? "-"}><td style={{ ...td, fontFamily: "inherit" }}>{c.city ?? "לא ידוע"}</td><td style={td}>{fmtInt(c.views)}</td><td style={td}>{fmtCtr(c.views, c.clicks)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
