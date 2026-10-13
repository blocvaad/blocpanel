"use client";
// הקרדיטים של ה-AI בבניין (bloc AI-1): כמה נוצל החודש, לאן זה הולך, החבילות הפעילות — ולסופר-אדמין
// מתנת קרדיטים (סיבה חובה; נרשמת ביומן). לפני SQL 173 — אומרים את זה, לא "0 קרדיטים".
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { AICreditsView } from "@/lib/aiCredits";

const TONE_BAR: Record<AICreditsView["tone"], string> = { green: "var(--blue)", yellow: "#eab308", red: "#ef4444" };
const MONTHS = [1, 3, 6, 12, 24];

export default function AICreditsCard({ buildingId, view, state, canGrant }: {
  buildingId: string;
  view: AICreditsView | null;
  /** null = נטען; 'missing' = SQL 173 עוד לא רץ; 'error' = הקריאה נכשלה. */
  state: "ok" | "missing" | "error";
  canGrant: boolean;
}) {
  const router = useRouter();
  const [units, setUnits] = useState("1000");
  const [months, setMonths] = useState(12);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function grant() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/buildings/${buildingId}/ai-credits`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units: Number(units), months, note }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: `נוספו ${Number(units).toLocaleString("he-IL")} קרדיטים לבניין.` });
        setNote("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: j.error ?? "המתנה לא נשמרה. נסו שוב." });
      }
    } catch {
      setMsg({ ok: false, text: "אין חיבור לשרת. נסו שוב." });
    }
    setBusy(false);
  }

  return (
    <div className="card" style={{ padding: "16px" }} data-ai-credits="">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", fontWeight: 700, marginBottom: "10px" }}>
        <Sparkles size={16} />
        קרדיטים ל-AI החודש
      </div>

      {state === "missing" && (
        <p style={{ fontSize: "14.5px", color: "var(--text-2)" }} data-ai-credits-missing="">
          עוד לא זמין: צריך להריץ את SQL 173 של bloc.
        </p>
      )}
      {state === "error" && (
        <p role="alert" style={{ fontSize: "14.5px", color: "var(--red)" }} data-ai-credits-error="">
          לא הצלחנו לטעון את השימוש ב-AI. רעננו את הדף.
        </p>
      )}

      {state === "ok" && view && (
        <>
          <div style={{ fontSize: "15px", fontWeight: 600 }} data-ai-credits-month="">{view.monthly}</div>
          <div style={{ height: "8px", borderRadius: "999px", background: "var(--surface)", overflow: "hidden", marginTop: "8px" }} aria-hidden>
            <div style={{ width: `${view.pct}%`, height: "100%", background: TONE_BAR[view.tone] }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "8px", marginTop: "12px", fontSize: "14px" }}>
            <div><span style={{ color: "var(--text-3)" }}>בחבילות: </span>{view.topups}</div>
            <div><span style={{ color: "var(--text-3)" }}>מי השתמש: </span>{view.who}</div>
          </div>
          {view.features.length > 0 && (
            <ul style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px" }}>
              {view.features.map((f) => (
                <li key={f.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ color: "var(--text-2)" }}>{f.label}</span>
                  <span style={{ fontWeight: 700, fontFamily: "var(--mono)" }}>{f.credits}</span>
                </li>
              ))}
            </ul>
          )}
          {view.systemCalls && <div style={{ fontSize: "13.5px", color: "var(--text-3)", marginTop: "6px" }}>{view.systemCalls}</div>}
          {view.packs.length > 0 && (
            <ul style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px" }} data-ai-credits-packs="">
              {view.packs.map((p) => <li key={p.id}>{p.line}</li>)}
            </ul>
          )}

          {canGrant && (
            <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "var(--text-3)" }}>
                קרדיטים
                <input type="number" min={1} max={100000} value={units} onChange={(e) => setUnits(e.target.value)} data-ai-grant-units=""
                  style={{ width: "120px", height: "44px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "15px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "var(--text-3)" }}>
                בתוקף
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))} data-ai-grant-months=""
                  style={{ height: "44px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "15px" }}>
                  {MONTHS.map((m) => <option key={m} value={m}>{m === 1 ? "חודש" : m === 12 ? "שנה" : m === 24 ? "שנתיים" : `${m} חודשים`}</option>)}
                </select>
              </label>
              <label style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "var(--text-3)" }}>
                למה
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="למשל: פיצוי על תקלה, פיילוט" maxLength={500} data-ai-grant-note=""
                  style={{ height: "44px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "15px" }} />
              </label>
              <button type="button" onClick={() => void grant()} disabled={busy || note.trim().length < 3 || !(Number(units) >= 1)} data-ai-grant=""
                style={{ height: "44px", padding: "0 16px", borderRadius: "8px", border: "none", background: "var(--blue)", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy || note.trim().length < 3 ? 0.6 : 1 }}>
                {busy ? "שומרים…" : "מתנת קרדיטים"}
              </button>
            </div>
          )}
          {msg && (
            <div role={msg.ok ? "status" : "alert"} data-ai-grant-msg={msg.ok ? "ok" : "error"}
              style={{ marginTop: "10px", fontSize: "14px", color: msg.ok ? "#22c55e" : "var(--red)" }}>
              {msg.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}
