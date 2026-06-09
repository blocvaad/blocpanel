"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

interface Building { id: string; name: string; }
interface Tenant { id: string; full_name: string; apartment_display: string; }

export default function CreatePaymentForm({ buildings }: { buildings: Building[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    building_id: "", tenant_id: "", amount: "",
    description: "", due_date: "",
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!form.building_id) { setTenants([]); return; }
    fetch(`/api/tenants?building_id=${form.building_id}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => setTenants(j.data ?? []));
  }, [form.building_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    const res = await fetch("/api/payments/create", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setSuccess(true); setTimeout(() => router.push("/payments"), 1500); }
    else { const j = await res.json(); setError(j.error ?? "שגיאה"); }
    setLoading(false);
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "13px 14px", fontSize: "15px",
    color: "var(--text)", outline: "none", fontFamily: "inherit",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "12px", fontWeight: "600",
    color: "var(--text-3)", textTransform: "uppercase",
    letterSpacing: ".06em", marginBottom: "8px",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Building */}
        <div>
          <label style={lbl}>בניין *</label>
          <select value={form.building_id} onChange={e => setForm(p => ({ ...p, building_id: e.target.value, tenant_id: "" }))}
            required style={inp}>
            <option value="">בחר בניין...</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Tenant */}
        <div>
          <label style={lbl}>דייר (אופציונלי)</label>
          <select value={form.tenant_id} onChange={e => setForm(p => ({ ...p, tenant_id: e.target.value }))}
            disabled={!form.building_id} style={{ ...inp, opacity: form.building_id ? 1 : .5 }}>
            <option value="">כל הבניין / לא ספציפי</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.full_name} — דירה {t.apartment_display}</option>)}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label style={lbl}>סכום (₪) *</label>
          <input type="number" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
            required min="1" placeholder="300"
            style={inp}
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
        </div>

        {/* Description */}
        <div>
          <label style={lbl}>תיאור</label>
          <input value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="ועד בית חודשי, תיקון מיוחד..."
            style={inp}
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
        </div>

        {/* Due date */}
        <div>
          <label style={lbl}>תאריך יעד (אופציונלי)</label>
          <input type="date" value={form.due_date}
            onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
            style={inp}
            onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
            onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
        </div>
      </div>

      {error && <div style={{ padding: "12px", borderRadius: "8px", background: "#ef444418", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)" }}>{error}</div>}
      {success && <div style={{ padding: "12px", borderRadius: "8px", background: "#22c55e18", border: "1px solid #22c55e30", fontSize: "13px", color: "var(--green)", textAlign: "center" }}>התשלום נוצר בהצלחה</div>}

      <button type="submit" disabled={loading || !form.building_id || !form.amount} style={{
        padding: "14px", borderRadius: "10px", border: "none",
        background: loading || !form.building_id || !form.amount ? "var(--border)" : "var(--text)",
        color: loading || !form.building_id || !form.amount ? "var(--text-3)" : "var(--bg)",
        fontSize: "15px", fontWeight: "700",
        cursor: loading || !form.building_id || !form.amount ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
      }}>
        <Save size={18} />{loading ? "יוצר..." : "צור תשלום"}
      </button>
    </form>
  );
}
