import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/pageAuth";
import { loadCampaignPage } from "@/lib/adsServer";
import { ADS_SQL_MISSING, parseReport, fmtInt, fmtCtr, fmtRange, SCREEN_LABEL, ilTodayKey } from "@/lib/ads";
import PrintButton from "@/components/ui/PrintButton";
export const dynamic = "force-dynamic";

// דוח למפרסם (bloc ADS-1; החלטה 75) — להדפסה / PDF: מספרים מצטברים בלבד. בלי משתמשים ובלי בניינים.
export default async function CampaignPrintReport({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession("ads.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadCampaignPage(id);
  if (data.state === "not_found") notFound();
  if (data.state !== "ok" || !data.campaign) {
    return <p style={{ padding: "24px", color: "var(--text)" }}>{data.state === "missing" ? ADS_SQL_MISSING : "טעינת הדוח נכשלה. רעננו את הדף."}</p>;
  }
  const c = data.campaign;
  const r = parseReport(data.report);
  const names = Object.fromEntries(data.creatives.map((x) => [x.id, x.headline]));
  const today = ilTodayKey().split("-").reverse().join(".");
  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white !important; } }
        @page { margin: 18mm; size: A4; }
        .ad-report { background: #fff; color: #0f172a; direction: rtl; font-family: Arial, sans-serif; padding: 28px; border-radius: 12px; max-width: 820px; }
        .ad-report h1 { font-size: 22px; font-weight: 800; margin: 0; }
        .ad-report h2 { font-size: 16px; font-weight: 700; margin: 22px 0 8px; }
        .ad-report .meta { font-size: 14px; color: #334155; margin-top: 6px; line-height: 1.7; }
        .ad-report .tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 16px; }
        .ad-report .tile { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
        .ad-report .tile b { display: block; font-size: 20px; margin-top: 4px; }
        .ad-report table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ad-report th { background: #f1f5f9; padding: 7px 10px; text-align: right; border: 1px solid #e2e8f0; font-weight: 600; }
        .ad-report td { padding: 6px 10px; border: 1px solid #e2e8f0; }
        .ad-report .note { font-size: 12px; color: #475569; margin-top: 18px; line-height: 1.6; }
      `}</style>
      <div className="no-print" style={{ marginBottom: "14px" }}><PrintButton /></div>
      <div className="ad-report" data-ad-print-report="">
        <h1>דוח פרסומת — bloc</h1>
        <div className="meta">
          <div>מפרסם: {c.advertiser}</div>
          <div>קמפיין: {c.name}</div>
          <div>תקופה: {fmtRange(c.starts_on, c.ends_on)}</div>
          <div>הופק: {today}</div>
        </div>
        <div className="tiles">
          <div className="tile">חשיפות<b>{fmtInt(r.totals.views)}</b></div>
          <div className="tile">אנשים שונים<b>{fmtInt(r.totals.reach)}</b></div>
          <div className="tile">הקלקות<b>{fmtInt(r.totals.clicks)}</b></div>
          <div className="tile">CTR<b>{fmtCtr(r.totals.views, r.totals.clicks)}</b></div>
          <div className="tile">סגירות<b>{fmtInt(r.totals.closes)}</b></div>
        </div>
        <h2>לפי יום</h2>
        {r.days.length === 0 ? <p>עוד לא הוצג כלום בקמפיין הזה.</p> : (
          <table><thead><tr><th>יום</th><th>חשיפות</th><th>אנשים שונים</th><th>הקלקות</th><th>CTR</th></tr></thead>
            <tbody>{r.days.map((d) => (
              <tr key={d.day}><td>{d.day.split("-").reverse().join(".")}</td><td>{fmtInt(d.views)}</td><td>{fmtInt(d.reach)}</td><td>{fmtInt(d.clicks)}</td><td>{fmtCtr(d.views, d.clicks)}</td></tr>
            ))}</tbody>
          </table>
        )}
        {r.creatives.length > 0 && (<>
          <h2>לפי פרסומת</h2>
          <table><thead><tr><th>פרסומת</th><th>חשיפות</th><th>הקלקות</th><th>CTR</th></tr></thead>
            <tbody>{r.creatives.map((x) => (
              <tr key={x.creative_id}><td>{names[x.creative_id] ?? "פרסומת"}</td><td>{fmtInt(x.views)}</td><td>{fmtInt(x.clicks)}</td><td>{fmtCtr(x.views, x.clicks)}</td></tr>
            ))}</tbody>
          </table>
        </>)}
        {r.screens.length > 0 && (<>
          <h2>לפי מסך באפליקציה</h2>
          <table><thead><tr><th>מסך</th><th>חשיפות</th><th>הקלקות</th><th>CTR</th></tr></thead>
            <tbody>{r.screens.map((s) => (
              <tr key={s.screen}><td>{SCREEN_LABEL[s.screen]}</td><td>{fmtInt(s.views)}</td><td>{fmtInt(s.clicks)}</td><td>{fmtCtr(s.views, s.clicks)}</td></tr>
            ))}</tbody>
          </table>
        </>)}
        {r.cities.length > 0 && (<>
          <h2>לפי עיר</h2>
          <table><thead><tr><th>עיר</th><th>חשיפות</th><th>הקלקות</th><th>CTR</th></tr></thead>
            <tbody>{r.cities.map((x) => (
              <tr key={x.city ?? "-"}><td>{x.city ?? "לא ידוע"}</td><td>{fmtInt(x.views)}</td><td>{fmtInt(x.clicks)}</td><td>{fmtCtr(x.views, x.clicks)}</td></tr>
            ))}</tbody>
          </table>
        </>)}
        <p className="note">
          חשיפה — הפרסומת הוצגה על המסך במלואה. אנשים שונים — כמה אנשים ראו אותה לפחות פעם אחת. CTR — הקלקות חלקי חשיפות.
          הדוח כולל מספרים מצטברים בלבד, בלי פרטים של אנשים או של בניינים.
        </p>
      </div>
    </>
  );
}
