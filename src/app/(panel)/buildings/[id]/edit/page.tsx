"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Save } from "lucide-react";
import Link from "next/link";

const PLANS = [
  { value: "free",  label: "Free",  desc: "עד 20 דיירים" },
  { value: "basic", label: "Basic", desc: "עד 100 דיירים" },
  { value: "pro",   label: "Pro",   desc: "ללא הגבלה" },
];

export default function EditBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [form, setForm] = useState({ name: "", address: "", plan: "free", max_tenants: "50" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/buildings/${id}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        if (j.data) setForm({
          name: j.data.name ?? "",
          address: j.data.address ?? "",
          plan: j.data.plan ?? "free",
          max_tenants: String(j.data.max_tenants ?? 50),
        });
        setFetching(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(""); setSuccess(false);
    const res = await fetch(`/api/buildings/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, max_tenants: parseInt(form.max_tenants) }),
    });
    if (res.ok) { setSuccess(true); setTimeout(() => router.push(`/buildings/${id}`), 1000); }
    else { const j = await res.json(); setError(j.error ?? "שגיאה"); }
    setLoading(false);
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "13px 14px", fontSize: "15px",
    color: "var(--text)", outline: "none", fontFamily: "inherit",
    transition: "border-color .15s",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "12px", fontWeight: "600",
    color: "var(--text-3)", textTransform: "uppercase",
    letterSpacing: ".06em", marginBottom: "8px",
  };

  if (fetching) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-3)" }}>טוען...</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "500px" }}>
      <Link href={`/buildings/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
        <ArrowRight size={14} />חזרה
      </Link>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>עריכת בניין</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>עדכון פרטי הבניין</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Name */}
          <div>
            <label style={lbl}>שם הבניין *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required style={inp}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
          </div>

          {/* Address */}
          <div>
            <label style={lbl}>כתובת</label>
            <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              placeholder="רחוב הרצל 1, תל אביב" style={inp}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
          </div>

          {/* Plan - custom buttons */}
          <div>
            <label style={lbl}>תוכנית</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
              {PLANS.map(p => (
                <button key={p.value} type="button" onClick={() => setForm(prev => ({ ...prev, plan: p.value }))}
                  style={{
                    padding: "12px 8px", borderRadius: "10px", border: "2px solid",
                    borderColor: form.plan === p.value ? "var(--text)" : "var(--border)",
                    background: form.plan === p.value ? "var(--card)" : "transparent",
                    cursor: "pointer", textAlign: "center" as const, transition: "all .15s",
                  }}>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: form.plan === p.value ? "var(--text)" : "var(--text-3)", marginBottom: "3px" }}>{p.label}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Max tenants */}
          <div>
            <label style={lbl}>מקסימום דיירים</label>
            <input type="number" value={form.max_tenants}
              onChange={e => setForm(p => ({ ...p, max_tenants: e.target.value }))}
              min="1" max="500" style={inp}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
          </div>
        </div>

        {error && <div style={{ padding: "12px", borderRadius: "8px", background: "#ef444418", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)" }}>{error}</div>}
        {success && <div style={{ padding: "12px", borderRadius: "8px", background: "#22c55e18", border: "1px solid #22c55e30", fontSize: "13px", color: "var(--green)", textAlign: "center" }}>עודכן בהצלחה</div>}

        <button type="submit" disabled={loading} style={{
          padding: "14px", borderRadius: "10px", border: "none",
          background: loading ? "var(--border)" : "var(--text)",
          color: loading ? "var(--text-3)" : "var(--bg)",
          fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
        }}>
          <Save size={18} />{loading ? "שומר..." : "שמור שינויים"}
        </button>
      </form>
    </div>
  );
}
