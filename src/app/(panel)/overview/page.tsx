import { adminClient } from "@/lib/supabase";
import StatCard from "@/components/ui/StatCard";
import RevenueChart from "@/components/charts/RevenueChart";
import AlertsPanel from "@/components/ui/AlertsPanel";
import RecentActivity from "@/components/ui/RecentActivity";
import Link from "next/link";
import { Building2, Users, CreditCard, Wrench, Clock, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [{ data: stats }, { data: buildings }, { data: logs }, { data: revenueRaw }] = await Promise.all([
    adminClient.from("panel_stats_view").select("*").single(),
    adminClient.from("buildings").select("id,name,created_at,plan").order("created_at", { ascending: false }).limit(5),
    adminClient.from("panel_audit_logs").select("id,action,admin_email,entity_type,created_at").order("created_at", { ascending: false }).limit(6),
    adminClient.from("payments").select("amount,created_at").eq("status","paid").gte("created_at", new Date(Date.now()-180*864e5).toISOString()),
  ]);

  const byMonth: Record<string,number> = {};
  for (const p of revenueRaw ?? []) {
    const m = new Date(p.created_at).toLocaleDateString("he-IL",{month:"short",year:"2-digit"});
    byMonth[m] = (byMonth[m]??0) + (p.amount??0);
  }
  const revenueData = Object.entries(byMonth).map(([month,amount])=>({month,amount}));

  const now = new Date().toLocaleDateString("he-IL",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"24px"}}>

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
          <StatCard label="בניינים פעילים" value={stats?.active_buildings??0} total={stats?.total_buildings} icon={Building2} color="blue" href="/buildings"/>
          <StatCard label="דיירים פעילים" value={stats?.total_tenants??0} icon={Users} color="muted" href="/tenants"/>
          <StatCard label="ממתינים לאישור" value={stats?.pending_approvals??0} icon={Clock} color="yellow" href="/tenants" alert={(stats?.pending_approvals??0)>0}/>
          <StatCard label="תקלות פתוחות" value={stats?.open_tickets??0} icon={Wrench} color="red" href="/tickets" alert={(stats?.open_tickets??0)>0}/>
          <StatCard label="תשלומים 30י" value={stats?.payments_30d??0} icon={CreditCard} color="blue" href="/payments"/>
          <StatCard label="הכנסות 30י" value={`₪${(stats?.revenue_30d??0).toLocaleString("he-IL")}`} icon={TrendingUp} color="green" href="/payments"/>
          <StatCard label="תשלומים נכשלו" value={stats?.failed_payments??0} icon={AlertTriangle} color="red" href="/payments" alert={(stats?.failed_payments??0)>0}/>
          <StatCard label="סה״כ בניינים" value={stats?.total_buildings??0} icon={CheckCircle} color="muted" href="/buildings"/>
        </div>
      </div>

      {/* Revenue + Alerts */}
      <div className="charts-row">
        <RevenueChart data={revenueData}/>
        <AlertsPanel stats={stats}/>
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
              <span style={{fontSize:"12px",color:"var(--text-3)",fontFamily:"var(--mono)",flexShrink:0}}>{new Date(b.created_at).toLocaleDateString("he-IL")}</span>
            </div>
          ))}
          {(buildings??[]).length===0&&(
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
