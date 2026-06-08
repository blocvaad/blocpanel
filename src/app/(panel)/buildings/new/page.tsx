"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, UserCheck, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function NewBuildingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", address: "", max_tenants: "50", plan: "free",
    admin_email: "", admin_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/buildings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (res.ok) router.push(`/buildings/${json.data.id}`);
      else setError(json.error ?? "שגיאה");
    } catch { setError("שגיאת רשת"); }
    setLoading(false);
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "13px 14px", fontSize: "15px",
    color: "var(--text)", outline: "none", fontFamily: "inherit",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: "12px", fontWeight: "600",
    color: "var(--text-3)", textTransform: "uppercase",
    letterSpacing: ".06em", marginBottom: "8px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "560px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link href="/buildings" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
          <ArrowRight size={14} />חזרה
        </Link>
      </div>

      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>בניין חדש</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>צור בניין ושייך ראש ועד</p>
      </div>

      {/* Steps */}
      <div style={{ display: "flex", gap: "8px" }}>
        {[1, 2].map(s => (
          <button key={s} onClick={() => setStep(s)} style={{
            flex: 1, padding: "12px", borderRadius: "10px",
            border: `2px solid ${step === s ? "var(--text)" : "var(--border)"}`,
            background: step === s ? "var(--card)" : "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: step === s ? "var(--text)" : "var(--surface)", border: `1px solid ${step === s ? "transparent" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: step === s ? "var(--bg)" : "var(--text-3)" }}>{s}</span>
            </div>
            <span style={{ fontSize: "13px", fontWeight: "500", color: step === s ? "var(--text)" : "var(--text-3)" }}>
              {s === 1 ? "פרטי בניין" : "ראש ועד"}
            </span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {step === 1 ? (
          <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <Building2 size={18} style={{ color: "var(--blue)" }} />
              <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)" }}>פרטי הבניין</span>
            </div>
            <div>
              <label style={label}>שם הבניין *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required placeholder="מגדל השלום 1" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>
            <div>
              <label style={label}>כתובת</label>
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                placeholder="רחוב הרצל 1, תל אביב" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={label}>תוכנית</label>
                <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))}
                  style={{ ...inp, cursor: "pointer" }}>
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label style={label}>מקסימום דיירים</label>
                <input type="number" value={form.max_tenants} onChange={e => setForm(p => ({ ...p, max_tenants: e.target.value }))}
                  min="1" max="500" style={inp}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
              </div>
            </div>
            <button type="button" onClick={() => setStep(2)}
              disabled={!form.name}
              style={{ padding: "13px", borderRadius: "8px", border: "none", background: form.name ? "var(--text)" : "var(--border)", color: form.name ? "var(--bg)" : "var(--text-3)", fontSize: "15px", fontWeight: "600", cursor: form.name ? "pointer" : "not-allowed" }}>
              המשך ←
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <UserCheck size={18} style={{ color: "var(--green)" }} />
              <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)" }}>ראש ועד</span>
            </div>

            <div style={{ background: "#3b82f610", border: "1px solid #3b82f630", borderRadius: "8px", padding: "12px 14px", fontSize: "13px", color: "var(--text-2)", lineHeight: 1.6 }}>
              ראש הועד יקבל הזמנה למייל ויוגדר כמנהל הבניין אוטומטית.
              <br /><span style={{ color: "var(--text-3)", fontSize: "12px" }}>ניתן לדלג ולהוסיף מאוחר יותר.</span>
            </div>

            <div>
              <label style={label}>שם מלא</label>
              <input value={form.admin_name} onChange={e => setForm(p => ({ ...p, admin_name: e.target.value }))}
                placeholder="ישראל ישראלי" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>
            <div>
              <label style={label}>כתובת מייל</label>
              <input type="email" value={form.admin_email} onChange={e => setForm(p => ({ ...p, admin_email: e.target.value }))}
                placeholder="admin@building.co.il" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>

            {error && (
              <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#ef444418", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)" }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => setStep(1)} style={{ flex: 1, padding: "13px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer" }}>
                → חזרה
              </button>
              <button type="submit" disabled={loading} style={{ flex: 2, padding: "13px", borderRadius: "8px", border: "none", background: loading ? "var(--border)" : "var(--text)", color: loading ? "var(--text-3)" : "var(--bg)", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "יוצר..." : "צור בניין"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
