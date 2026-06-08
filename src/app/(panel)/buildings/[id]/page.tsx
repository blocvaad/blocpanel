import { adminClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Users, Wrench, CreditCard, Lock, Calendar, Hash } from "lucide-react";
import BuildingActions from "@/components/ui/BuildingActions";
import Link from "next/link";
import { FileText } from "lucide-react";
export const dynamic = "force-dynamic";

export default async function BuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: building } = await adminClient
    .from("buildings").select("*").eq("id", id).single();
  if (!building) notFound();

  const [
    { data: tenants },
    { data: tickets },
    { data: payments },
  ] = await Promise.all([
    adminClient.from("panel_tenants_view").select("*").eq("building_id", id).order("created_at", { ascending: false }),
    adminClient.from("panel_tickets_view").select("*").eq("building_id", id).order("created_at", { ascending: false }),
    adminClient.from("panel_payments_view").select("*").eq("building_id", id).order("created_at", { ascending: false }).limit(30),
  ]);

  const openTickets    = (tickets ?? []).filter(t => t.status === "פתוח" || t.status === "open");
  const urgentTickets  = (tickets ?? []).filter(t => t.priority === "high" || t.priority === "urgent");
  const pendingTenants = (tenants ?? []).filter(t => t.approval_status === "pending");
  const blockedTenants = (tenants ?? []).filter(t => t.approval_status === "blocked");
  const paidAmount     = (payments ?? []).filter(p => p.status === "paid").reduce((s, p) => s + (p.amount ?? 0), 0);
  const failedPayments = (payments ?? []).filter(p => p.status === "failed");

  const SC: Record<string, { label:string; bg:string; color:string }> = {
    "פתוח":       {label:"פתוח",bg:"#ef444418",color:"#ef4444"},
    open:        {label:"פתוח",   bg:"#ef444418",color:"#ef4444"},
    "בטיפול":    {label:"בטיפול", bg:"#3b82f618",color:"#3b82f6"},
    in_progress: {label:"בטיפול", bg:"#3b82f618",color:"#3b82f6"},
    "טופל":      {label:"טופל",   bg:"#22c55e18",color:"#22c55e"},
    resolved:    {label:"טופל",   bg:"#22c55e18",color:"#22c55e"},
    "סגור":      {label:"סגור",   bg:"#52525b18",color:"#52525b"},
    closed:      {label:"סגור",   bg:"#52525b18",color:"#52525b"},
  };

  const TSC: Record<string, {label:string;bg:string;color:string}> = {
    approved:{label:"מאושר",bg:"#22c55e18",color:"#22c55e"},
    pending: {label:"ממתין",bg:"#eab30818",color:"#eab308"},
    blocked: {label:"חסום", bg:"#ef444418",color:"#ef4444"},
    rejected:{label:"נדחה", bg:"#52525b18",color:"#52525b"},
  };

  const PSC: Record<string, {label:string;badge:string}> = {
    paid:     {label:"שולם", badge:"badge-green"},
    pending:  {label:"ממתין",badge:"badge-yellow"},
    failed:   {label:"נכשל", badge:"badge-red"},
    cancelled:{label:"בוטל", badge:"badge-muted"},
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>

      {/* Back */}
      <Link href="/buildings" style={{display:"inline-flex",alignItems:"center",gap:"6px",fontSize:"13px",color:"var(--text-3)",textDecoration:"none"}}>
        <ArrowRight size={14}/>
        חזרה לבניינים
      </Link>

      {/* Header */}
      <div className="card" style={{padding:"20px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"12px",marginBottom:"16px"}}>
          <div>
            <h1 style={{fontSize:"24px",fontWeight:"700",color:"var(--text)",letterSpacing:"-.03em",marginBottom:"4px"}}>{building.name}</h1>
            {building.address && <p style={{fontSize:"14px",color:"var(--text-3)"}}>{building.address}</p>}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Link href={`/buildings/${id}/report`} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", borderRadius: "8px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--text-3)", fontSize: "13px", fontWeight: "500",
              textDecoration: "none",
            }}>
              <FileText size={15} />דוח PDF
            </Link>
            <BuildingActions buildingId={id} buildingName={building.name}/>
          </div>
        </div>

        {/* Building info */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
          <div style={{background:"var(--surface)",borderRadius:"8px",padding:"12px 14px"}}>
            <div style={{fontSize:"10px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:"5px"}}>קוד הזמנה</div>
            <code style={{fontSize:"16px",fontWeight:"700",color:"var(--blue)",fontFamily:"var(--mono)"}}>{building.invite_code ?? "—"}</code>
          </div>
          <div style={{background:"var(--surface)",borderRadius:"8px",padding:"12px 14px"}}>
            <div style={{fontSize:"10px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:"5px"}}>תוכנית</div>
            <span className="badge badge-muted" style={{fontSize:"13px"}}>{building.plan ?? "free"}</span>
          </div>
          <div style={{background:"var(--surface)",borderRadius:"8px",padding:"12px 14px"}}>
            <div style={{fontSize:"10px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:"5px"}}>מקסימום דיירים</div>
            <span style={{fontSize:"16px",fontWeight:"700",color:"var(--text)"}}>{building.max_tenants ?? "∞"}</span>
          </div>
          <div style={{background:"var(--surface)",borderRadius:"8px",padding:"12px 14px"}}>
            <div style={{fontSize:"10px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:"5px"}}>נוצר</div>
            <span style={{fontSize:"13px",color:"var(--text-2)",fontFamily:"var(--mono)"}}>{new Date(building.created_at).toLocaleDateString("he-IL")}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
        <div className="card" style={{padding:"18px",borderColor:openTickets.length>0?"#ef444440":"var(--border)"}}>
          {openTickets.length>0&&<div style={{position:"absolute",top:0,right:0,left:0,height:"2px",background:"linear-gradient(90deg,transparent,#ef4444,transparent)",borderRadius:"12px 12px 0 0"}}/>}
          <div style={{fontSize:"11px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:"8px"}}>תקלות פתוחות</div>
          <div style={{fontSize:"32px",fontWeight:"700",color:openTickets.length>0?"#ef4444":"var(--text)",letterSpacing:"-.03em"}}>{openTickets.length}</div>
          {urgentTickets.length>0&&<div style={{fontSize:"12px",color:"#f97316",marginTop:"4px"}}>{urgentTickets.length} דחופות</div>}
        </div>
        <div className="card" style={{padding:"18px",borderColor:pendingTenants.length>0?"#eab30840":"var(--border)"}}>
          <div style={{fontSize:"11px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:"8px"}}>דיירים</div>
          <div style={{fontSize:"32px",fontWeight:"700",color:"var(--text)",letterSpacing:"-.03em"}}>{(tenants??[]).length}</div>
          {pendingTenants.length>0&&<div style={{fontSize:"12px",color:"#eab308",marginTop:"4px"}}>{pendingTenants.length} ממתינים לאישור</div>}
        </div>
        <div className="card" style={{padding:"18px"}}>
          <div style={{fontSize:"11px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:"8px"}}>הכנסות</div>
          <div style={{fontSize:"28px",fontWeight:"700",color:"#22c55e",letterSpacing:"-.03em"}}>₪{(paidAmount).toLocaleString("he-IL")}</div>
          <div style={{fontSize:"12px",color:"var(--text-3)",marginTop:"4px"}}>מ-{(payments??[]).length} תשלומים</div>
        </div>
        <div className="card" style={{padding:"18px",borderColor:failedPayments.length>0?"#ef444440":"var(--border)"}}>
          <div style={{fontSize:"11px",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:"8px"}}>תשלומים נכשלו</div>
          <div style={{fontSize:"32px",fontWeight:"700",color:failedPayments.length>0?"#ef4444":"var(--text)",letterSpacing:"-.03em"}}>{failedPayments.length}</div>
        </div>
      </div>

      {/* Open tickets - PRIORITY SECTION */}
      {openTickets.length > 0 && (
        <div>
          <div style={{fontSize:"11px",fontWeight:"600",color:"#ef4444",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"10px",display:"flex",alignItems:"center",gap:"8px"}}>
            <Wrench size={14}/>
            תקלות פתוחות — דורשות טיפול
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {openTickets.map(t => {
              const sc = SC[t.status] ?? SC.open;
              const urgColors: Record<string,string> = {high:"#f97316",urgent:"#ef4444",medium:"#eab308",low:"#52525b"};
                const urgLabels: Record<string,string> = {high:"גבוה",urgent:"דחוף",medium:"בינוני",low:"נמוך",critical:"קריטי"};
              return (
                <div key={t.id} className="card" style={{padding:"16px",borderColor:"#ef444430"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"10px",marginBottom:"10px"}}>
                    <span style={{fontSize:"15px",fontWeight:"600",color:"var(--text)",flex:1}}>{t.title}</span>
                    <span className="badge" style={{background:sc.bg,color:sc.color,flexShrink:0}}>{sc.label}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",fontSize:"12px",color:"var(--text-3)"}}>
                    {t.reporter_name&&<span>{t.reporter_name}</span>}
                    {t.apartment_display&&!t.apartment_display.startsWith("🔒")&&<span>דירה {t.apartment_display}</span>}
                    {t.priority&&<span style={{color:urgColors[t.priority]??urgColors.medium,fontWeight:"600"}}>{urgLabels[t.priority]??t.priority}</span>}
                    <span style={{marginRight:"auto",fontFamily:"var(--mono)"}}>{new Date(t.created_at).toLocaleDateString("he-IL")}</span>
                  </div>
                  {t.description&&<div style={{fontSize:"13px",color:"var(--text-3)",marginTop:"8px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tenants */}
      <div>
        <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"10px",display:"flex",alignItems:"center",gap:"8px"}}>
          <Users size={14}/>
          דיירים ({(tenants??[]).length})
          {pendingTenants.length>0&&<span className="badge badge-yellow" style={{fontSize:"11px"}}>{pendingTenants.length} ממתינים</span>}
          {blockedTenants.length>0&&<span className="badge badge-red" style={{fontSize:"11px"}}>{blockedTenants.length} חסומים</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
          {(tenants??[]).map(t => {
            const sc = TSC[t.approval_status] ?? TSC.approved;
            return (
              <div key={t.id} className="card" style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:"12px",borderColor:t.approval_status==="pending"?"#eab30830":t.approval_status==="blocked"?"#ef444430":"var(--border)"}}>
                <div style={{width:"36px",height:"36px",borderRadius:"50%",background:"#3b82f620",border:"1px solid #3b82f640",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden"}}>
                  {t.avatar_url
                    ? <img src={t.avatar_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <span style={{fontSize:"15px",fontWeight:"700",color:"var(--blue)"}}>{t.full_name.charAt(0)}</span>
                  }
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"14px",fontWeight:"500",color:"var(--text)"}}>{t.full_name}</div>
                  <div style={{fontSize:"12px",color:"var(--text-3)",marginTop:"2px",display:"flex",gap:"8px"}}>
                    {!t.apartment_display.startsWith("🔒")&&<span>דירה {t.apartment_display}</span>}
                    <span>{t.role==="admin"?"מנהל 👑":t.role==="council"?"ועד":"דייר"}</span>
                  </div>
                </div>
                <span className="badge" style={{background:sc.bg,color:sc.color,flexShrink:0}}>{sc.label}</span>
              </div>
            );
          })}
          {(tenants??[]).length===0&&<div className="card" style={{padding:"32px",textAlign:"center",color:"var(--text-3)"}}>אין דיירים</div>}
        </div>
      </div>

      {/* Payments */}
      <div>
        <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"10px",display:"flex",alignItems:"center",gap:"8px"}}>
          <CreditCard size={14}/>
          תשלומים אחרונים
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
          {(payments??[]).map(p => {
            const sc = PSC[p.status] ?? PSC.pending;
            return (
              <div key={p.id} className="card" style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:"12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"14px",fontWeight:"500",color:"var(--text)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.description ?? "תשלום"}</div>
                  <div style={{fontSize:"12px",color:"var(--text-3)",marginTop:"2px"}}>{p.tenant_name ?? "—"}</div>
                </div>
                <div style={{textAlign:"left",flexShrink:0}}>
                  <div style={{fontSize:"16px",fontWeight:"700",color:"var(--text)",fontFamily:"var(--mono)"}}>₪{(p.amount).toLocaleString("he-IL")}</div>
                  <div style={{fontSize:"11px",color:"var(--text-3)",marginTop:"1px",fontFamily:"var(--mono)"}}>{new Date(p.created_at).toLocaleDateString("he-IL")}</div>
                </div>
                <span className={`badge ${sc.badge}`} style={{flexShrink:0}}>{sc.label}</span>
              </div>
            );
          })}
          {(payments??[]).length===0&&<div className="card" style={{padding:"32px",textAlign:"center",color:"var(--text-3)"}}>אין תשלומים</div>}
        </div>
      </div>

      {/* All tickets */}
      {(tickets??[]).length > openTickets.length && (
        <div>
          <div style={{fontSize:"11px",fontWeight:"600",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:"10px"}}>
            כל התקלות ({(tickets??[]).length})
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
            {(tickets??[]).filter(t=>t.status!=="פתוח"&&t.status!=="open").map(t=>{
              const sc = SC[t.status] ?? {label:t.status,bg:"#52525b18",color:"#52525b"};
              return (
                <div key={t.id} className="card" style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:"12px",opacity:.8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"14px",color:"var(--text-2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                    <div style={{fontSize:"12px",color:"var(--text-3)",marginTop:"2px"}}>{t.reporter_name ?? "—"}</div>
                  </div>
                  <span style={{fontSize:"12px",color:"var(--text-3)",fontFamily:"var(--mono)",flexShrink:0}}>{new Date(t.created_at).toLocaleDateString("he-IL")}</span>
                  <span className="badge" style={{background:sc.bg,color:sc.color,flexShrink:0}}>{sc.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
