// src/app/api/ads/report/route.ts — הדוח של קמפיין (bloc ADS-1; החלטה 75): מספרים מצטברים בלבד.
//
//   GET ?campaign=<id>             → JSON (הדוח, הקמפיין, המפרסם, החוזה)
//   GET ?campaign=<id>&format=csv  → CSV למפרסם (נרשם ביומן: AD_REPORT_EXPORT)
//
// בלי משתמשים ובלי בניינים — סה"כ, לפי יום, לפי פרסומת, לפי מסך ולפי עיר (ad_report, SQL 175).
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { auditLog } from "@/lib/auth";
import { adminClient } from "@/lib/supabase";
import { adsDbMessage, adsSqlMissing, parseReport, reportCsv, reportFileName } from "@/lib/ads";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const g = await guard({ permission: "ads.read" });
  if (!g.ok) return g.response;

  const sp = new URL(req.url).searchParams;
  const id = sp.get("campaign") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "קמפיין לא תקין" }, { status: 400, headers: noStore });

  const c = await adminClient.from("ad_campaigns").select("id, name, starts_on, ends_on, contract_id").eq("id", id).maybeSingle();
  if (c.error) {
    return NextResponse.json({ error: adsDbMessage(c.error, "טעינת הדוח נכשלה. נסו שוב.") }, { status: adsSqlMissing(c.error) ? 503 : 500, headers: noStore });
  }
  const camp = c.data as Row | null;
  if (!camp) return NextResponse.json({ error: "הקמפיין לא נמצא" }, { status: 404, headers: noStore });

  const [k, crs, rep] = await Promise.all([
    adminClient.from("ad_contracts").select("id, reference, pricing, price_ils, advertiser_id").eq("id", camp.contract_id as string).maybeSingle(),
    adminClient.from("ad_creatives").select("id, headline").eq("campaign_id", id),
    adminClient.rpc("ad_report", { p_campaign: id }),
  ]);
  const err = k.error ?? crs.error ?? rep.error;
  if (err) {
    return NextResponse.json({ error: adsDbMessage(err, "טעינת הדוח נכשלה. נסו שוב.") }, { status: adsSqlMissing(err) ? 503 : 500, headers: noStore });
  }
  const contract = k.data as Row | null;
  let advertiser = "";
  if (contract?.advertiser_id) {
    const a = await adminClient.from("ad_advertisers").select("name").eq("id", contract.advertiser_id as string).maybeSingle();
    advertiser = String((a.data as Row | null)?.name ?? "");
  }
  const report = parseReport(rep.data);
  const creatives = Object.fromEntries(((crs.data ?? []) as Row[]).map((r) => [String(r.id), String(r.headline ?? "")]));

  if (sp.get("format") === "csv") {
    const csv = reportCsv({
      advertiser, campaign: String(camp.name), starts_on: String(camp.starts_on), ends_on: String(camp.ends_on), creatives,
    }, report);
    await auditLog(g.session, "AD_REPORT_EXPORT", "ad_campaign", id, { name: camp.name }, req.headers.get("x-forwarded-for") ?? undefined);
    const name = reportFileName(String(camp.name));
    return new NextResponse(csv, {
      headers: {
        ...noStore,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bloc-ad-report.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  }
  return NextResponse.json({ campaign: camp, contract, advertiser, creatives, report }, { headers: noStore });
}
