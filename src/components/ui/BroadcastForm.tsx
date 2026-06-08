"use client";
import { useState } from "react";
import { Send, Users, Building2, ChevronDown } from "lucide-react";

const PRIORITIES = [
  { value: "low",    label: "רגיל",  emoji: "ℹ️", color: "#52525b" },
  { value: "normal", label: "חשוב",  emoji: "📢", color: "#3b82f6" },
  { value: "high",   label: "גבוה",  emoji: "⚠️", color: "#f97316" },
  { value: "urgent", label: "דחוף",  emoji: "🚨", color: "#ef4444" },
];

interface Building { id: string; name: string; }

export default function BroadcastForm({ buildings }: { buildings: Building[] }) {
  const [title, setTitle]           = useState("");
  const [content, setContent]       = useState("");
  const [priority, setPriority]     = useState("normal");
  const [buildingId, setBuildingId] = useState("");
  const [showBuildings, setShowBuildings] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<{ sent: number; ok: boolean } | null>(null);

  const selectedBuilding = buildings.find(b => b.id === buildingId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !content) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, content, priority, building_id: buildingId || undefined }),
      });
      const json = await res.json();
      setResult({ sent: json.sent, ok: res.ok });
      if (res.ok) { setTitle(""); setContent(""); }
    } catch { setResult({ sent: 0, ok: false }); }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Target */}
      <div className="card" style={{ padding: "18px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "14px" }}>יעד השליחה</div>

        {/* All buildings button */}
        <button type="button" onClick={() => { setBuildingId(""); setShowBuildings(false); }}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: "10px",
            border: `2px solid ${!buildingId ? "var(--text)" : "var(--border)"}`,
            background: !buildingId ? "var(--card)" : "transparent",
            display: "flex", alignItems: "center", gap: "14px",
            cursor: "pointer", marginBottom: "8px", transition: "all .15s",
          }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "9px", background: !buildingId ? "var(--text)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
            <Users size={18} style={{ color: !buildingId ? "var(--bg)" : "var(--text-3)" }} />
          </div>
          <div style={{ flex: 1, textAlign: "right" }}>
            <div style={{ fontSize: "15px", fontWeight: "600", color: !buildingId ? "var(--text)" : "var(--text-2)" }}>כל הבניינים</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{buildings.length} בניינים · כל הדיירים</div>
          </div>
          {!buildingId && <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--bg)" }} />
          </div>}
        </button>

        {/* Specific building */}
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setShowBuildings(!showBuildings)}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: "10px",
              border: `2px solid ${buildingId ? "var(--blue)" : "var(--border)"}`,
              background: buildingId ? "#3b82f610" : "transparent",
              display: "flex", alignItems: "center", gap: "14px",
              cursor: "pointer", transition: "all .15s",
            }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "9px", background: buildingId ? "#3b82f620" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Building2 size={18} style={{ color: buildingId ? "var(--blue)" : "var(--text-3)" }} />
            </div>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: buildingId ? "var(--text)" : "var(--text-2)" }}>
                {selectedBuilding ? selectedBuilding.name : "בניין ספציפי"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                {selectedBuilding ? "נבחר" : "בחר בניין מהרשימה"}
              </div>
            </div>
            <ChevronDown size={16} style={{ color: "var(--text-3)", transform: showBuildings ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
          </button>

          {/* Dropdown */}
          {showBuildings && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, left: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden", zIndex: 10, boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>
              {buildings.map(b => (
                <button key={b.id} type="button"
                  onClick={() => { setBuildingId(b.id); setShowBuildings(false); }}
                  style={{ width: "100%", padding: "14px 16px", border: "none", background: buildingId === b.id ? "#3b82f615" : "transparent", color: buildingId === b.id ? "var(--blue)" : "var(--text)", fontSize: "15px", fontWeight: buildingId === b.id ? "600" : "400", cursor: "pointer", textAlign: "right", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", transition: "background .1s" }}>
                  {b.name}
                  {buildingId === b.id && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--blue)" }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Priority */}
      <div className="card" style={{ padding: "18px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "14px" }}>עדיפות</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
          {PRIORITIES.map(p => (
            <button key={p.value} type="button" onClick={() => setPriority(p.value)}
              style={{
                padding: "12px 8px", borderRadius: "10px",
                border: `2px solid ${priority === p.value ? p.color : "var(--border)"}`,
                background: priority === p.value ? p.color + "20" : "transparent",
                cursor: "pointer", textAlign: "center", transition: "all .15s",
              }}>
              <div style={{ fontSize: "20px", marginBottom: "4px" }}>{p.emoji}</div>
              <div style={{ fontSize: "12px", fontWeight: "600", color: priority === p.value ? p.color : "var(--text-3)" }}>{p.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="card" style={{ padding: "18px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "14px" }}>תוכן ההודעה</div>
        <div style={{ marginBottom: "12px" }}>
          <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200}
            placeholder="כותרת ההכרזה..."
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "13px 14px", fontSize: "16px", fontWeight: "600", color: "var(--text)", outline: "none", fontFamily: "inherit", marginBottom: "10px" }}
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
          <textarea value={content} onChange={e => setContent(e.target.value)} required maxLength={3000}
            placeholder="תוכן ההודעה..." rows={5}
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "13px 14px", fontSize: "14px", color: "var(--text)", outline: "none", fontFamily: "inherit", resize: "vertical", lineHeight: 1.6 }}
            onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = "var(--blue)"}
            onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = "var(--border)"} />
          <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", textAlign: "left" }}>{content.length}/3000</div>
        </div>
      </div>

      {result && (
        <div style={{ padding: "14px 16px", borderRadius: "10px", background: result.ok ? "#22c55e18" : "#ef444418", border: `1px solid ${result.ok ? "#22c55e30" : "#ef444430"}`, fontSize: "14px", fontWeight: "600", color: result.ok ? "var(--green)" : "var(--red)" }}>
          {result.ok ? `✓ ההודעה נשלחה ל-${result.sent} בניינים בהצלחה` : "שגיאה בשליחה — נסה שוב"}
        </div>
      )}

      <button type="submit" disabled={loading || !title || !content}
        style={{ padding: "16px", borderRadius: "12px", border: "none", background: loading || !title || !content ? "var(--border)" : "var(--text)", color: loading || !title || !content ? "var(--text-3)" : "var(--bg)", fontSize: "16px", fontWeight: "700", cursor: loading || !title || !content ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", transition: "all .2s" }}>
        <Send size={18} />
        {loading ? "שולח..." : `שלח${buildingId ? " לבניין" : " לכולם"}`}
      </button>
    </form>
  );
}
