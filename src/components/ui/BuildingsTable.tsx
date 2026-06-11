"use client";
import { useState } from "react";
import { Search, Users, Wrench, PauseCircle, PlayCircle, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import SuspendBuildingModal from "./SuspendBuildingModal";
import type { PanelBuilding } from "@/types";
import { useRouter } from "next/navigation";
import DeleteBuildingModal from "./DeleteBuildingModal";

const PAGE_SIZE = 20;

export default function BuildingsTable({ initialData }: { initialData: PanelBuilding[] }) {
  const [buildings, setBuildings] = useState(initialData);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PanelBuilding | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<PanelBuilding | null>(null);
  const router = useRouter();

  const filtered = buildings.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(v: string) { setSearch(v); setPage(1); }

  async function confirmToggle() {
    if (!suspendTarget) return;
    setLoading(suspendTarget.id);
    setSuspendTarget(null);
    const res = await fetch(`/api/buildings/${suspendTarget.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !suspendTarget.is_active }),
    });
    if (res.ok) setBuildings(prev => prev.map(x => x.id === suspendTarget.id ? { ...x, is_active: !x.is_active } : x));
    setLoading(null);
  }

  async function confirmDelete(reason: string) {
    if (!deleteTarget) return;
    setLoading(deleteTarget.id);
    setDeleteTarget(null);
    const res = await fetch(`/api/buildings/${deleteTarget.id}`, {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) setBuildings(prev => prev.filter(x => x.id !== deleteTarget.id));
    setLoading(null);
  }

  return (
    <>
      {suspendTarget && (
        <SuspendBuildingModal
          buildingName={suspendTarget.name}
          isActive={suspendTarget.is_active}
          onConfirm={confirmToggle}
          onCancel={() => setSuspendTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteBuildingModal
          buildingName={deleteTarget.name}
          onConfirm={(reason) => confirmDelete(reason)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={16} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
            <input className="input" value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="חיפוש..." style={{ paddingRight: "44px", fontSize: "15px", height: "48px" }} />
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize: "13px", color: "var(--text-3)", whiteSpace: "nowrap" }}>
              {filtered.length} בניינים
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {paged.map(b => (
            <div key={b.id} className="card" style={{ padding: "18px", cursor: "pointer", transition: "border-color .15s" }}
              onClick={() => router.push(`/buildings/${b.id}`)}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: b.is_active ? "var(--green)" : "var(--text-3)", flexShrink: 0 }} />
                  <span style={{ fontSize: "17px", fontWeight: "700", color: "var(--text)" }}>{b.name}</span>
                </div>
                <ChevronLeft size={18} style={{ color: "var(--text-3)" }} />
              </div>

              {b.address && (
                <div style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "14px" }}>{b.address}</div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>דיירים</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Users size={13} style={{ color: "var(--blue)" }} />
                    <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--text)" }}>{b.tenant_count}</span>
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>תקלות</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Wrench size={13} style={{ color: b.open_tickets > 0 ? "var(--red)" : "var(--text-3)" }} />
                    <span style={{ fontSize: "18px", fontWeight: "700", color: b.open_tickets > 0 ? "var(--red)" : "var(--text)" }}>{b.open_tickets}</span>
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "10px 12px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".05em" }}>ממתינים</div>
                  <span style={{ fontSize: "18px", fontWeight: "700", color: b.pending_count > 0 ? "var(--yellow)" : "var(--text)" }}>{b.pending_count}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <code style={{ fontSize: "13px", color: "var(--blue)", background: "#3b82f615", padding: "4px 10px", borderRadius: "6px", fontFamily: "var(--mono)" }}>
                  {b.invite_code ?? "—"}
                </code>
                <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                  <button onClick={e => { e.stopPropagation(); setSuspendTarget(b); }} disabled={loading === b.id} title={b.is_active ? "השהה" : "הפעל"}
                    style={{ width:"34px",height:"34px",borderRadius:"7px",border:`1px solid ${b.is_active ? "#f9731630" : "#22c55e30"}`,background:b.is_active?"#f9731612":"#22c55e12",color:b.is_active?"#f97316":"var(--green)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:loading===b.id?.5:1 }}>
                    {b.is_active ? <PauseCircle size={16}/> : <PlayCircle size={16}/>}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(b); }} disabled={loading === b.id} title="מחיקה"
                    style={{ width:"34px",height:"34px",borderRadius:"7px",border:"1px solid var(--border)",background:"transparent",color:"var(--text-3)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:loading===b.id?.5:1 }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {paged.length === 0 && (
            <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>לא נמצאו בניינים</div>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              style={{ width:"34px",height:"34px",borderRadius:"8px",border:"1px solid var(--border)",background:"transparent",color:"var(--text-3)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:safePage===1?.4:1 }}>
              <ChevronRight size={16}/>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{
                width:"34px",height:"34px",borderRadius:"8px",border:"1px solid",
                borderColor: p === safePage ? "var(--text)" : "var(--border)",
                background: p === safePage ? "var(--text)" : "transparent",
                color: p === safePage ? "var(--bg)" : "var(--text-3)",
                fontSize:"13px",fontWeight:"600",cursor:"pointer",
              }}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              style={{ width:"34px",height:"34px",borderRadius:"8px",border:"1px solid var(--border)",background:"transparent",color:"var(--text-3)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:safePage===totalPages?.4:1 }}>
              <ChevronLeft size={16}/>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
