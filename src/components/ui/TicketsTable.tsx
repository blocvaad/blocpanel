"use client";
import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { PanelTicket } from "@/types";

const PAGE_SIZE = 20;

const SC: Record<string, { label: string; bg: string; color: string }> = {
  "פתוח":      { label:"פתוח",   bg:"#ef444418", color:"#ef4444" },
  open:        { label:"פתוח",   bg:"#ef444418", color:"#ef4444" },
  "בטיפול":    { label:"בטיפול", bg:"#3b82f618", color:"#3b82f6" },
  in_progress: { label:"בטיפול", bg:"#3b82f618", color:"#3b82f6" },
  "טופל":      { label:"טופל",   bg:"#22c55e18", color:"#22c55e" },
  resolved:    { label:"טופל",   bg:"#22c55e18", color:"#22c55e" },
  "סגור":      { label:"סגור",   bg:"#52525b18", color:"#52525b" },
  closed:      { label:"סגור",   bg:"#52525b18", color:"#52525b" },
};

const UC: Record<string, { label: string; color: string }> = {
  high:     { label:"גבוה",   color:"#f97316" },
  medium:   { label:"בינוני", color:"#eab308" },
  low:      { label:"נמוך",   color:"#52525b" },
  urgent:   { label:"דחוף",   color:"#ef4444" },
  critical: { label:"קריטי",  color:"#ef4444" },
};

const FILTERS = ["הכל", "פתוח", "בטיפול", "טופל", "סגור"];
const STATUS_MAP: Record<string, string> = { "פתוח":"open", "בטיפול":"in_progress", "טופל":"resolved", "סגור":"closed" };

export default function TicketsTable({ initialData }: { initialData: PanelTicket[] }) {
  const [search, setSearch] = useState("");
  const [sf, setSf] = useState("הכל");
  const [page, setPage] = useState(1);

  const filtered = initialData.filter(t => {
    const ms = t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.building_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = sf === "הכל" || t.status === sf || t.status === STATUS_MAP[sf];
    return ms && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(v: string) { setSearch(v); setPage(1); }
  function handleFilter(f: string) { setSf(f); setPage(1); }

  const counts: Record<string, number> = {};
  for (const f of FILTERS) {
    counts[f] = f === "הכל" ? initialData.length
      : initialData.filter(t => t.status === f || t.status === STATUS_MAP[f]).length;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input className="input" value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="חיפוש לפי כותרת או בניין..."
          style={{ paddingRight: "44px", fontSize: "15px", height: "48px" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
        {FILTERS.filter(f => f !== "הכל").map(f => {
          const sc = SC[f] ?? { bg: "#52525b18", color: "#52525b" };
          const active = sf === f;
          return (
            <button key={f} onClick={() => handleFilter(active ? "הכל" : f)} style={{
              padding: "12px 8px", borderRadius: "10px", border: `1px solid ${active ? sc.color + "60" : "var(--border)"}`,
              background: active ? sc.bg : "var(--card)", cursor: "pointer", textAlign: "center",
            }}>
              <div style={{ fontSize: "20px", fontWeight: "700", color: sc.color }}>{counts[f]}</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "3px" }}>{f}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => handleFilter(f)} style={{
            padding: "8px 18px", borderRadius: "99px", border: "1px solid",
            borderColor: sf === f ? "var(--text)" : "var(--border)",
            background: sf === f ? "var(--text)" : "transparent",
            color: sf === f ? "var(--bg)" : "var(--text-3)",
            fontSize: "14px", fontWeight: "500", cursor: "pointer",
          }}>{f}</button>
        ))}
      </div>

      {filtered.length > 0 && (
        <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
          {filtered.length} תקלות · עמוד {safePage} מתוך {totalPages}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {paged.map(t => {
          const sc = SC[t.status] ?? SC.open;
          const uc = UC[t.priority] ?? { label: t.priority ?? "—", color: "var(--text-3)" };
          return (
            <div key={t.id} className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>{t.title}</div>
                  <div style={{ fontSize: "13px", color: "var(--text-3)" }}>{t.building_name}</div>
                </div>
                <span className="badge" style={{ background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".05em" }}>מדווח</div>
                  <div style={{ fontSize: "13px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.reporter_name ?? "—"}</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".05em" }}>עדיפות</div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: uc.color }}>{uc.label}</div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: "6px", padding: "8px 10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-3)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: ".05em" }}>תאריך</div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>{new Date(t.created_at).toLocaleDateString("he-IL")}</div>
                </div>
              </div>

              {t.description && (
                <div style={{ fontSize: "13px", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description}
                </div>
              )}
            </div>
          );
        })}
        {paged.length === 0 && (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>לא נמצאו תקלות</div>
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
  );
}
