"use client";
import { useState } from "react";
import { Send, Building2, Users } from "lucide-react";

const PRIORITIES = [
  { value: "low",    label: "ℹ️ רגיל",   color: "#52525b" },
  { value: "normal", label: "📢 חשוב",   color: "#3b82f6" },
  { value: "high",   label: "⚠️ גבוה",   color: "#f97316" },
  { value: "urgent", label: "🚨 דחוף",   color: "#ef4444" },
];

interface Building { id: string; name: string; }

export default function BroadcastForm({ buildings }: { buildings: Building[] }) {
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [priority, setPriority]   = useState("normal");
  const [buildingId, setBuildingId] = useState("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<{ sent: number; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !content) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, content, priority, building_id: buildingId || undefined }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ sent: json.sent, ok: true });
        setTitle(""); setContent("");
      } else {
        setResult({ sent: 0, ok: false });
      }
    } catch {
      setResult({ sent: 0, ok: false });
    }
    setLoading(false);
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "12px 14px", fontSize: "15px",
    color: "var(--text)", outline: "none", fontFamily: "inherit",
    transition: "border-color .15s",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Target */}
      <div className="card" style={{ padding: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "12px" }}>יעד השליחה</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <button type="button" onClick={() => setBuildingId("")}
            style={{ padding: "14px", borderRadius: "10px", border: `2px solid ${!buildingId ? "var(--text)" : "var(--border)"}`, background: !buildingId ? "var(--text)" : "transparent", color: !buildingId ? "var(--bg)" : "var(--text-3)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <Users size={20} />
            <span style={{ fontSize: "13px", fontWeight: "600" }}>כל הבניינים</span>
            <span style={{ fontSize: "11px", opacity: .7 }}>{buildings.length} בניינים</span>
          </button>
          <div style={{ padding: "8px", borderRadius: "10px", border: `2px solid ${buildingId ? "var(--blue)" : "var(--border)"}`, background: buildingId ? "#3b82f610" : "transparent" }}>
            <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "6px" }}>בניין ספציפי</div>
            <select value={buildingId} onChange={e => setBuildingId(e.target.value)}
              style={{ ...inp, padding: "8px 10px", fontSize: "13px", background: "transparent", border: "none", outline: "none" }}>
              <option value="">בחר בניין...</option>
              {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Priority */}
      <div>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "10px" }}>עדיפות</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "6px" }}>
          {PRIORITIES.map(p => (
            <button key={p.value} type="button" onClick={() => setPriority(p.value)}
              style={{ padding: "10px 6px", borderRadius: "8px", border: `1px solid ${priority === p.value ? p.color : "var(--border)"}`, background: priority === p.value ? p.color + "20" : "transparent", color: priority === p.value ? p.color : "var(--text-3)", cursor: "pointer", fontSize: "12px", fontWeight: "500" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>כותרת</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200}
          placeholder="כותרת ההכרזה..." style={inp}
          onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
          onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
      </div>

      {/* Content */}
      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: "8px" }}>תוכן</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} required maxLength={3000}
          placeholder="תוכן ההודעה..." rows={5}
          style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
          onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = "var(--blue)"}
          onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = "var(--border)"} />
        <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", textAlign: "left" }}>{content.length}/3000</div>
      </div>

      {/* Result */}
      {result && (
        <div style={{ padding: "14px 16px", borderRadius: "8px", background: result.ok ? "#22c55e18" : "#ef444418", border: `1px solid ${result.ok ? "#22c55e30" : "#ef444430"}`, fontSize: "14px", fontWeight: "500", color: result.ok ? "var(--green)" : "var(--red)" }}>
          {result.ok ? `✓ ההודעה נשלחה ל-${result.sent} בניינים` : "שגיאה בשליחה — נסה שוב"}
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={loading || !title || !content}
        style={{ padding: "14px", borderRadius: "10px", border: "none", background: loading || !title || !content ? "var(--border)" : "var(--text)", color: loading || !title || !content ? "var(--text-3)" : "var(--bg)", fontSize: "15px", fontWeight: "700", cursor: loading || !title || !content ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
        <Send size={18} />
        {loading ? "שולח..." : `שלח${buildingId ? " לבניין" : " לכולם"}`}
      </button>
    </form>
  );
}
