"use client";
// src/components/ui/BuildingEditForm.tsx — טופס עריכת בניין: שם, כתובת, מקסימום דיירים.
//
// PANEL-PAY א1 (החלטה 363): בלי מסלול ובלי "סיבה למנוי ללא תשלום". מסלול בלי חיוב מוענק ומסתיים מהכרטיס "מסלול בלי
// חיוב" בדף הבניין — סופר-אדמין, עם קוד אישור, דרך bloc. הטופס אומר לאן זה עבר, עם קישור.
// BuildingEditFormView — התצוגה בלבד (props → markup), לבדיקה בשרת ולצילומי המסך.
import Link from "next/link";
import { ArrowRight, Save, Gift } from "lucide-react";

export type EditFormValues = { name: string; address: string; max_tenants: string };
export type BuildingEditFormViewProps = {
  id: string;
  form: EditFormValues;
  loading: boolean;
  error: string;
  success: boolean;
  onChange?: (patch: Partial<EditFormValues>) => void;
  onSubmit?: () => void;
};

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
const focusBlue = (e: { target: unknown }) => { (e.target as HTMLInputElement).style.borderColor = "var(--blue)"; };
const blurGray = (e: { target: unknown }) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; };

export function BuildingEditFormView({ id, form, loading, error, success, onChange, onSubmit }: BuildingEditFormViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "500px" }} data-building-edit="">
      <Link href={`/buildings/${id}`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
        <ArrowRight size={14} />חזרה
      </Link>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>עריכת בניין</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>עדכון פרטי הבניין</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={lbl} htmlFor="b-name">שם הבניין *</label>
            <input id="b-name" value={form.name} onChange={(e) => onChange?.({ name: e.target.value })} required style={inp} onFocus={focusBlue} onBlur={blurGray} />
          </div>
          <div>
            <label style={lbl} htmlFor="b-address">כתובת</label>
            <input id="b-address" value={form.address} onChange={(e) => onChange?.({ address: e.target.value })} placeholder="רחוב הרצל 1, תל אביב" style={inp} onFocus={focusBlue} onBlur={blurGray} />
          </div>
          <div>
            <label style={lbl} htmlFor="b-max">מקסימום דיירים</label>
            <input id="b-max" type="number" value={form.max_tenants} onChange={(e) => onChange?.({ max_tenants: e.target.value })} min="1" max="500" style={inp} onFocus={focusBlue} onBlur={blurGray} />
          </div>
        </div>

        {/* PANEL-PAY א1: המסלול לא כאן — מהכרטיס בדף הבניין */}
        <Link href={`/buildings/${id}`} data-plan-moved-note="" style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", textDecoration: "none", color: "var(--text-2)", fontSize: "13.5px", lineHeight: 1.6 }}>
          <Gift size={16} color="var(--blue)" style={{ flexShrink: 0, marginTop: "3px" }} />
          <span>המסלול לא נערך כאן. מסלול בלי חיוב מוענק ומסתיים מהכרטיס <b style={{ color: "var(--text)" }}>&quot;מסלול בלי חיוב&quot;</b> בדף הבניין (סופר-אדמין).</span>
        </Link>

        {error && <div role="alert" style={{ padding: "12px", borderRadius: "8px", background: "#ef444418", border: "1px solid #ef444430", fontSize: "13px", color: "var(--red)" }}>{error}</div>}
        {success && <div role="status" style={{ padding: "12px", borderRadius: "8px", background: "#22c55e18", border: "1px solid #22c55e30", fontSize: "13px", color: "var(--green)", textAlign: "center" }}>עודכן בהצלחה</div>}

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

/** גוף ה-PATCH: רק שם, כתובת ומקסימום דיירים — אף פעם לא מסלול. */
export function editBody(form: EditFormValues): { name: string; address: string; max_tenants: number } {
  return { name: form.name, address: form.address, max_tenants: parseInt(form.max_tenants, 10) };
}
