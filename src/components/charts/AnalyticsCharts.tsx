"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend,
  AreaChart, Area, RadialBarChart, RadialBar,
} from "recharts";

const COLORS = ["#3b82f6","#22c55e","#eab308","#ef4444","#8b5cf6","#06b6d4","#f97316"];

function Tip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border-2)", borderRadius:"8px", padding:"10px 14px", direction:"rtl" }}>
      {label&&<div style={{ fontSize:"12px", color:"var(--text-3)", marginBottom:"6px" }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ fontSize:"13px", fontWeight:"600", color:p.color??"var(--text)", marginBottom:"2px" }}>
          {p.name}: {typeof p.value==="number"&&p.name?.includes("₪") ? `₪${p.value.toLocaleString("he-IL")}` : p.value}
        </div>
      ))}
    </div>
  );
}

const URGENCY_HE: Record<string,string> = { high:"גבוה", medium:"בינוני", low:"נמוך", urgent:"דחוף", critical:"קריטי", other:"אחר" };
const STATUS_HE: Record<string,string>  = { "פתוח":"פתוח", open:"פתוח", "בטיפול":"בטיפול", in_progress:"בטיפול", "טופל":"טופל", resolved:"טופל", "סגור":"סגור", closed:"סגור" };
const PAYMENT_HE: Record<string,string> = { paid:"שולם", pending:"ממתין", pending_approval:"ממתין לאישור", failed:"נכשל", cancelled:"בוטל", exempt:"פטור" };
const TENANT_HE: Record<string,string>  = { approved:"מאושר", pending:"ממתין", blocked:"חסום", rejected:"נדחה" };
const PLAN_COLORS: Record<string,string>= { free:"#52525b", basic:"#3b82f6", pro:"#22c55e" };

const card = { background:"var(--card)", border:"1px solid var(--border)", borderRadius:"12px", padding:"20px" };
const title = { fontSize:"14px", fontWeight:"600" as const, color:"var(--text)", marginBottom:"4px" };
const sub   = { fontSize:"12px", color:"var(--text-3)", marginBottom:"18px" };

interface Props {
  buildingStats: { name:string; tenant_count:number; open_tickets:number; pending_count:number }[];
  paymentCounts: Record<string,number>;
  ticketByUrgency: Record<string,number>;
  ticketByStatus: Record<string,number>;
  growthByMonth: Record<string,number>;
  revenueByMonth: Record<string,number>;
  tenantStatus: Record<string,number>;
  planCounts: Record<string,number>;
  collectionRate: number;
  totalRevenue: number;
  totalDebt: number;
}

export default function AnalyticsCharts({
  buildingStats, paymentCounts, ticketByUrgency,
  ticketByStatus, growthByMonth, revenueByMonth,
  tenantStatus, planCounts, collectionRate, totalRevenue, totalDebt,
}: Props) {

  // Revenue by month
  const revenueData = Object.entries(revenueByMonth).map(([month,amount])=>({ month, "₪ הכנסות":amount }));

  // Growth by month
  const growthData = Object.entries(growthByMonth).map(([month,count])=>({ month, "דיירים חדשים":count }));

  // Payment pie
  const paymentPie = Object.entries(paymentCounts).filter(([,v])=>v>0)
    .map(([k,v])=>({ name:PAYMENT_HE[k]??k, value:v }));

  // Ticket urgency
  const urgencyBar = Object.entries(ticketByUrgency)
    .map(([k,v])=>({ name:URGENCY_HE[k]??k, תקלות:v }))
    .sort((a,b)=>b.תקלות-a.תקלות);

  // Ticket status progress bars
  const statusBar = Object.entries(ticketByStatus)
    .map(([k,v])=>({ name:STATUS_HE[k]??k, value:v }));
  const maxStatus = Math.max(...statusBar.map(s=>s.value), 1);

  // Tenant status pie
  const tenantPie = Object.entries(tenantStatus).filter(([,v])=>v>0)
    .map(([k,v])=>({ name:TENANT_HE[k]??k, value:v }));

  // Plan distribution
  const planBar = Object.entries(planCounts)
    .map(([k,v])=>({ name:k, בניינים:v }));

  // Building comparison
  const buildingBar = buildingStats.slice(0,8).map(b=>({
    name: b.name.length>10 ? b.name.slice(0,10)+"…" : b.name,
    "דיירים": b.tenant_count,
    "תקלות": b.open_tickets,
  }));

  // Collection gauge
  const gaugeData = [{ name:"גבייה", value:collectionRate, fill: collectionRate>=80?"#22c55e":collectionRate>=60?"#eab308":"#ef4444" }];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>

      {/* Revenue area chart */}
      <div style={card}>
        <div style={title}>הכנסות חודשיות</div>
        <div style={sub}>12 חודשים אחרונים</div>
        {revenueData.length===0
          ? <div style={{ height:"160px", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)", fontSize:"13px" }}>אין נתונים</div>
          : <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={revenueData} margin={{ left:-20, right:0, top:0, bottom:0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false}/>
                <XAxis dataKey="month" tick={{ fill:"#a1a1aa", fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"#52525b", fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`₪${v}`}/>
                <Tooltip content={<Tip/>}/>
                <Area type="monotone" dataKey="₪ הכנסות" stroke="#22c55e" strokeWidth={2.5} fill="url(#rev)" dot={{ fill:"#22c55e", r:3, strokeWidth:0 }}/>
              </AreaChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Collection rate gauge + debt */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
        <div style={{ ...card, textAlign:"center" as const }}>
          <div style={title}>שיעור גבייה</div>
          <ResponsiveContainer width="100%" height={130}>
            <RadialBarChart cx="50%" cy="70%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} data={gaugeData} barSize={16}>
              <RadialBar dataKey="value" cornerRadius={8} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{ fontSize:"28px", fontWeight:"800", color:collectionRate>=80?"#22c55e":collectionRate>=60?"#eab308":"#ef4444", marginTop:"-20px" }}>{collectionRate}%</div>
        </div>
        <div style={card}>
          <div style={title}>מאזן</div>
          <div style={{ marginTop:"16px", display:"flex", flexDirection:"column" as const, gap:"12px" }}>
            <div style={{ background:"#22c55e15", borderRadius:"8px", padding:"12px 14px" }}>
              <div style={{ fontSize:"11px", color:"var(--text-3)", marginBottom:"4px" }}>שולם</div>
              <div style={{ fontSize:"20px", fontWeight:"700", color:"#22c55e" }}>₪{totalRevenue.toLocaleString("he-IL")}</div>
            </div>
            <div style={{ background:"#ef444415", borderRadius:"8px", padding:"12px 14px" }}>
              <div style={{ fontSize:"11px", color:"var(--text-3)", marginBottom:"4px" }}>חוב פתוח</div>
              <div style={{ fontSize:"20px", fontWeight:"700", color:"#ef4444" }}>₪{totalDebt.toLocaleString("he-IL")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment distribution pie */}
      <div style={card}>
        <div style={title}>התפלגות תשלומים</div>
        <div style={sub}>לפי סטטוס</div>
        {paymentPie.length===0
          ? <div style={{ height:"160px", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)" }}>אין נתונים</div>
          : <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={paymentPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                    {paymentPie.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip content={<Tip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:"8px", justifyContent:"center" }}>
                {paymentPie.map((item,i)=>{
                  const total = paymentPie.reduce((s,p)=>s+p.value,0);
                  const pct = Math.round((item.value/total)*100);
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"12px", color:"var(--text-2)" }}>
                      <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:COLORS[i%COLORS.length] }}/>
                      {item.name} ({item.value} · {pct}%)
                    </div>
                  );
                })}
              </div>
            </>
        }
      </div>

      {/* Tenant status pie */}
      <div style={card}>
        <div style={title}>סטטוס דיירים</div>
        <div style={sub}>התפלגות כלל הדיירים</div>
        {tenantPie.length===0
          ? <div style={{ height:"160px", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)" }}>אין נתונים</div>
          : <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={tenantPie} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={2}>
                    {tenantPie.map((item,i)=>{
                      const c: Record<string,string>={ "מאושר":"#22c55e","ממתין":"#eab308","חסום":"#ef4444","נדחה":"#52525b" };
                      return <Cell key={i} fill={c[item.name]??COLORS[i]}/>;
                    })}
                  </Pie>
                  <Tooltip content={<Tip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:"8px", justifyContent:"center" }}>
                {tenantPie.map((item,i)=>{
                  const total = tenantPie.reduce((s,p)=>s+p.value,0);
                  const pct = Math.round((item.value/total)*100);
                  const c: Record<string,string>={ "מאושר":"#22c55e","ממתין":"#eab308","חסום":"#ef4444","נדחה":"#52525b" };
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"12px", color:"var(--text-2)" }}>
                      <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:c[item.name]??COLORS[i] }}/>
                      {item.name} ({item.value} · {pct}%)
                    </div>
                  );
                })}
              </div>
            </>
        }
      </div>

      {/* Building comparison */}
      <div style={card}>
        <div style={title}>השוואת בניינים</div>
        <div style={sub}>דיירים ותקלות לפי בניין</div>
        {buildingBar.length===0
          ? <div style={{ height:"160px", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)" }}>אין נתונים</div>
          : <ResponsiveContainer width="100%" height={Math.max(160, buildingBar.length*50)}>
              <BarChart data={buildingBar} layout="vertical" margin={{ right:20, left:0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#27272a" horizontal={false}/>
                <XAxis type="number" tick={{ fill:"#52525b", fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" tick={{ fill:"#a1a1aa", fontSize:11 }} axisLine={false} tickLine={false} width={80}/>
                <Tooltip content={<Tip/>}/>
                <Legend wrapperStyle={{ fontSize:"12px", color:"var(--text-3)" }}/>
                <Bar dataKey="דיירים" fill="#3b82f6" radius={[0,4,4,0]} maxBarSize={20}/>
                <Bar dataKey="תקלות" fill="#ef4444" radius={[0,4,4,0]} maxBarSize={20}/>
              </BarChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Ticket urgency */}
      <div style={card}>
        <div style={title}>תקלות לפי דחיפות</div>
        <div style={sub}>התפלגות עדיפויות</div>
        {urgencyBar.length===0
          ? <div style={{ height:"120px", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)" }}>אין תקלות</div>
          : <ResponsiveContainer width="100%" height={140}>
              <BarChart data={urgencyBar} margin={{ left:-20, right:0, top:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false}/>
                <XAxis dataKey="name" tick={{ fill:"#a1a1aa", fontSize:12 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"#52525b", fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip content={<Tip/>}/>
                <Bar dataKey="תקלות" radius={[4,4,0,0]} maxBarSize={40}>
                  {urgencyBar.map((entry,i)=>{
                    const c: Record<string,string>={ "דחוף":"#ef4444","גבוה":"#f97316","בינוני":"#eab308","נמוך":"#52525b","קריטי":"#ef4444","אחר":"#52525b" };
                    return <Cell key={i} fill={c[entry.name]??"#3b82f6"}/>;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Ticket status progress */}
      <div style={card}>
        <div style={title}>סטטוס תקלות</div>
        <div style={sub}>מצב טיפול עדכני</div>
        <div style={{ display:"flex", flexDirection:"column" as const, gap:"10px" }}>
          {statusBar.map((s,i)=>{
            const pct = Math.round((s.value/maxStatus)*100);
            const total = statusBar.reduce((a,b)=>a+b.value,0);
            const pctOfTotal = total>0?Math.round((s.value/total)*100):0;
            const c: Record<string,string>={ "פתוח":"#ef4444",open:"#ef4444","בטיפול":"#3b82f6",in_progress:"#3b82f6","טופל":"#22c55e",resolved:"#22c55e","סגור":"#52525b",closed:"#52525b" };
            const color = c[s.name]??"#3b82f6";
            return (
              <div key={i}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"5px" }}>
                  <span style={{ fontSize:"13px", color:"var(--text-2)", fontWeight:"500" }}>{s.name}</span>
                  <span style={{ fontSize:"13px", color:"var(--text-3)" }}>{s.value} · {pctOfTotal}%</span>
                </div>
                <div style={{ height:"10px", background:"var(--surface)", borderRadius:"99px", overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:"99px", transition:"width .6s ease" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tenant growth line */}
      <div style={card}>
        <div style={title}>גידול דיירים</div>
        <div style={sub}>12 חודשים אחרונים</div>
        {growthData.length===0
          ? <div style={{ height:"140px", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-3)" }}>אין נתונים</div>
          : <ResponsiveContainer width="100%" height={140}>
              <LineChart data={growthData} margin={{ left:-24, right:0, top:4, bottom:0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#27272a" vertical={false}/>
                <XAxis dataKey="month" tick={{ fill:"#a1a1aa", fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"#52525b", fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip content={<Tip/>}/>
                <Line type="monotone" dataKey="דיירים חדשים" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill:"#3b82f6", r:4, strokeWidth:0 }}/>
              </LineChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Plan distribution */}
      <div style={card}>
        <div style={title}>התפלגות תוכניות</div>
        <div style={sub}>בניינים לפי תוכנית</div>
        <div style={{ display:"flex", gap:"8px" }}>
          {planBar.map((p,i)=>{
            const total = planBar.reduce((a,b)=>a+b.בניינים,0);
            const pct = total>0?Math.round((p.בניינים/total)*100):0;
            const color = PLAN_COLORS[p.name]??"#52525b";
            return (
              <div key={i} style={{ flex:Math.max(p.בניינים,0.5), background:color+"18", border:`1px solid ${color}30`, borderRadius:"10px", padding:"14px 12px", textAlign:"center" as const }}>
                <div style={{ fontSize:"22px", fontWeight:"800", color }}>{p.בניינים}</div>
                <div style={{ fontSize:"13px", color:"var(--text-2)", marginTop:"3px", fontWeight:"600" }}>{p.name}</div>
                <div style={{ fontSize:"11px", color:"var(--text-3)", marginTop:"2px" }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
