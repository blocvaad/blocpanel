import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import { readBloc } from "@/lib/blocRead";
import { heMonthLabel } from "@/lib/months";
import { actorOf } from "@/lib/moneyActions";
import { can } from "@/lib/permissions";
import { WITHOUT_DM_ROWS } from "@/lib/dmReports";
import { OVERVIEW_FAILED_TEXT, OVERVIEW_PARTIAL_TEXT, OVERVIEW_CAPPED_TEXT } from "@/lib/dashboardTexts";
import StatCard from "@/components/ui/StatCard";
import RevenueChart from "@/components/charts/RevenueChart";
import AlertsPanel from "@/components/ui/AlertsPanel";
import RecentActivity from "@/components/ui/RecentActivity";
import Link from "next/link";
import { Building2, Users, CreditCard, Wrench, Clock, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
export const dynamic = "force-dynamic";


/** MOD-1 (סקירה #7): מי שלא רואה דיווחים על שיחות פרטיות — בלי השורות שלהם בפעילות האחרונה. */
function recentFor<Q extends { or: (expr: string) => Q }>(q: Q, seesDmReports: boolean): Q {
  return seesDmReports ? q : q.or(WITHOUT_DM_ROWS);
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requirePageSession("buildings.read");
  const denied = (await searchParams)?.denied === "1";
  // א3-1 (bloc, החלטה 444): המונים, הבניינים האחרונים, הגבייה בבניינים לפי חודש והתורים — מ-bloc, בבקשה חתומה (lib/blocRead).
  // הפעילות האחרונה — מהטבלאות של הפאנל עצמו, עד הקבוצה האחרונה של א3.
  const [r, { data: logs }] = await Promise.all([
    readBloc("overview", {}, actorOf(session)),
    // MOD-1 (סקירה #7): בלי פעולות על דיווחים על שיחות פרטיות למי שלא רואה דיווחים
    recentFor(adminClient.from("panel_audit_logs").select("id,action,admin_email,entity_type,created_at"), can(session.role, "dm_reports.read"))
      .order("created_at", { ascending: false }).limit(6),
  ]);
  const d = r.ok ? r.data : null;
  const failed = new Set(d?.failed ?? []);
  const stats = d?.stats ?? null;
  // גבייה בבניינים (כספי הבניינים — לא הכנסה של bloc), לפי מועד התשלום בפועל, חודש בשעון ישראל.
  const revenueData = (d?.revenueByMonth ?? []).map(({ month, amount }) => ({ month: heMonthLabel(month), amount }));
  const buildings = d && !failed.has("recentBuildings") ? d.recentBuildings : null;
  const value = (v: unknown) => (stats ? Number(v ?? 0) : "—");
  // מונה שלא נטען — null (בכרטיס "—", ובהתראות "לא נטען"), אף פעם 0.
  const pendingReports = d?.counts.pendingReports ?? null;
  const supplierQueue = d?.counts.supplierQueue ?? null;
  const declined30 = d?.counts.declined30 ?? null;
  // bloc COMPANY-1 (MG-S1252, החלטה 654): חברות שממתינות לאישור, ובקשות לנהל בניין בלי ועד — מאותה קריאה של bloc.
  // bloc ישן בלי השדות — undefined → null ("לא נטען"), לא 0.
  const companiesPending = d?.counts.companiesPending ?? null;
  const linkRequests = d?.counts.linkRequests ?? null;
  const revenueFailed = !d || failed.has("revenue");

  // השרת רץ ב-UTC; הברכה והתאריך לפי שעון ישראל.
  const now = new Date().toLocaleDateString("he-IL",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"Asia/Jerusalem"});
  const hour = Number(new Intl.DateTimeFormat("en-GB",{hour:"numeric",hourCycle:"h23",timeZone:"Asia/Jerusalem"}).format(new Date()));
  const greeting = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"24px"}}>

      {denied && (
        <div className="card" style={{padding:"12px 16px",fontSize:"13px",color:"var(--yellow)",borderColor:"#eab30840"}}>
          אין לתפקיד שלך הרשאה לדף שביקשת — הועברת לסקירה.
        </div>
      )}

      {!r.ok && (
        <div role="alert" data-overview-failed="" className="card" style={{padding:"12px 16px",fontSize:"13px",color:"var(--red)",borderColor:"#ef444440"}}>
          <div style={{fontWeight:600}}>{OVERVIEW_FAILED_TEXT}</div>
          <div style={{marginTop:"4px",color:"var(--text-2)"}}>הסיבה: {r.error}</div>
        </div>
      )}
      {d && failed.size > 0 && (
        <div role="status" data-overview-partial="" className="card" style={{padding:"12px 16px",fontSize:"13px",color:"var(--red)",borderColor:"#ef444440"}}>
          {OVERVIEW_PARTIAL_TEXT}
        </div>
      )}
      {d?.partial && (
        <div role="status" data-overview-capped="" className="card" style={{padding:"12px 16px",fontSize:"13px",color:"var(--yellow)",borderColor:"#eab30840"}}>
          {OVERVIEW_CAPPED_TEXT}
        </div>
      )}

      {/* Greeting */}
      <div style={{padding:"20px",borderRadius:"12px",background:"linear-gradient(135deg,#3b82f610,#22c55e08)",border:"1px solid var(--border)"}}>
        <h1 style={{fontSize:"24px",fontWeight:"700",color:"var(--text)",letterSpacing:"-.03em",marginBottom:"4px"}}>
          {greeting}, טל 👋
        </h1>
        <p style={{fontSize:"14px",color:"var(--text-3)"}}>{now}</p>
      </div>

      {/* Stats - 2x2 on mobile, 4x2 on desktop */}
      <div>
        <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"12px"}}>
          נתונים כלליים
        </div>
        <div className="stat-grid">
          <StatCard label="בניינים פעילים" value={value(stats?.active_buildings)} total={stats ? Number(stats.total_buildings ?? 0) : undefined} icon={Building2} color="blue" href="/buildings"/>
          <StatCard label="דיירים פעילים" value={value(stats?.total_tenants)} icon={Users} color="muted" href="/tenants"/>
          <StatCard label="ממתינים לאישור" value={value(stats?.pending_approvals)} icon={Clock} color="yellow" href="/tenants" alert={Number(stats?.pending_approvals ?? 0)>0}/>
          <StatCard label="תקלות פתוחות" value={value(stats?.open_tickets)} icon={Wrench} color="red" href="/tickets" alert={Number(stats?.open_tickets ?? 0)>0}/>
          <StatCard label="תשלומים 30י" value={value(stats?.payments_30d)} icon={CreditCard} color="blue" href="/payments"/>
          <StatCard label="גבייה בבניינים 30י" value={stats ? `₪${Number(stats.revenue_30d ?? 0).toLocaleString("he-IL")}` : "—"} icon={TrendingUp} color="green" href="/payments"/>
          <StatCard label="דיווחים ממתינים לוועד" value={pendingReports ?? "—"} icon={AlertTriangle} color="yellow" href="/debt" alert={(pendingReports ?? 0)>0}/>
          <StatCard label="סה״כ בניינים" value={value(stats?.total_buildings)} icon={CheckCircle} color="muted" href="/buildings"/>
        </div>
      </div>

      {/* Revenue + Alerts */}
      <div className="charts-row">
        <RevenueChart data={revenueData} failed={revenueFailed}/>
        <AlertsPanel stats={stats ? { pending_approvals: Number(stats.pending_approvals ?? 0), open_tickets: Number(stats.open_tickets ?? 0) } : null} extra={{ pendingReports, supplierQueue, declined30, companiesPending, linkRequests }}/>
      </div>

      {/* Recent buildings */}
      <div>
        <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"12px"}}>
          בניינים אחרונים
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
          {(buildings??[]).map(b=>(
            <div key={b.id} className="card" style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:"14px"}}>
              <div style={{width:"10px",height:"10px",borderRadius:"50%",background:"var(--green)",flexShrink:0}}/>
              <span style={{flex:1,fontSize:"15px",fontWeight:"500",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</span>
              <span className="badge badge-muted" style={{fontFamily:"var(--mono)",fontSize:"12px"}}>{b.plan??"free"}</span>
              <span style={{fontSize:"12px",color:"var(--text-3)",fontFamily:"var(--mono)",flexShrink:0}}>{b.created_at ? new Date(b.created_at).toLocaleDateString("he-IL") : ""}</span>
            </div>
          ))}
          {buildings===null&&(
            <div className="card" style={{padding:"32px",textAlign:"center",color:"var(--text-3)"}}>הבניינים האחרונים לא נטענו</div>
          )}
          {buildings!==null&&buildings.length===0&&(
            <div className="card" style={{padding:"32px",textAlign:"center",color:"var(--text-3)"}}>אין בניינים עדיין</div>
          )}
        </div>
        <Link href="/buildings" style={{display:"block",textAlign:"center",fontSize:"13px",color:"var(--blue)",marginTop:"10px",padding:"10px"}}>
          כל הבניינים ←
        </Link>
      </div>

      {/* Recent activity */}
      <div>
        <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"12px"}}>
          פעילות אחרונה
        </div>
        <RecentActivity logs={logs??[]}/>
        <Link href="/logs" style={{display:"block",textAlign:"center",fontSize:"13px",color:"var(--blue)",marginTop:"10px",padding:"10px"}}>
          כל הלוגים ←
        </Link>
      </div>

    </div>
  );
}
