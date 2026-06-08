"use client";
import { useState } from "react";
import { Search, Users, Wrench, ToggleLeft, ToggleRight, Trash2, ChevronLeft } from "lucide-react";
import type { PanelBuilding } from "@/types";
import { useRouter } from "next/navigation";
import DeleteBuildingModal from "./DeleteBuildingModal";

export default function BuildingsTable({ initialData }: { initialData: PanelBuilding[] }) {
  const [buildings, setBuildings] = useState(initialData);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PanelBuilding | null>(null);
  const router = useRouter();

  const filtered = buildings.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function toggleActive(e: React.MouseEvent, b: PanelBuilding) {
    e.stopPropagation();
    setLoading(b.id);
    const res = await fetch(`/api/buildings/${b.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !b.is_active }),
    });
    if (res.ok) setBuildings(prev => prev.map(x => x.id === b.id ? { ...x, is_active: !x.is_active } : x));
    setLoading(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setLoading(deleteTarget.id);
    setDeleteTarget(null);
    const res = await fetch(`/api/buildings/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setBuildings(prev => prev.filter(x => x.id !== deleteTarget.id));
    else alert('שגיאה בהשהיית הבניין');
    setLoading(null);
  }

  return (
    <>
      {deleteTarget && (
        <DeleteBuildingModal
          buildingName={deleteTarget.name}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input className="input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש..." style={{ paddingRight: "44px", fontSize: "15px", height: "48px" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map(b => (
            <div key={b.id} className="card" style={{ padding: "18px", cursor: "pointer", transition: "border-color .15s" }}
              onClick={() => router.push(`/buildings/${b.id}`)}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
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
                  <button onClick={e => toggleActive(e, b)} disabled={loading === b.id} title={b.is_active ? "השהה" : "הפעל"}
                    style={{ width:"34px",height:"34px",borderRadius:"7px",border:"1px solid var(--border)",background:"transparent",color:b.is_active?"var(--green)":"var(--text-3)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:loading===b.id?.5:1 }}>
                    {b.is_active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(b); }} disabled={loading === b.id} title="מחיקה"
                    style={{ width:"34px",height:"34px",borderRadius:"7px",border:"1px solid var(--border)",background:"transparent",color:"var(--text-3)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:loading===b.id?.5:1 }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>לא נמצאו בניינים</div>
          )}
        </div>
      </div>
    </>
  );
}
