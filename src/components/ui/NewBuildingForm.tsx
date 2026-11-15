"use client";
// src/components/ui/NewBuildingForm.tsx — הטופס של "בניין חדש" (שני שלבים: פרטי בניין, ראש ועד) — התצוגה בלבד.
// PANEL-PAY א2: הוצא מהדף כדי לרנדר בשרת כל מצב (בפאנל אין happy-dom) — גם את מה שקורה אחרי "צור בניין" (NewBuildingNotice).
// המצב והשליחה (stepUpFetch, הגוף, המעבר לדף הבניין) נשארים בדף.
import Link from "next/link";
import { Building2, UserCheck, ArrowRight, Gift } from "lucide-react";
import { createLocked, type NewBuildingOutcome } from "@/lib/blocActionsUi";
import { NewBuildingNoticeView } from "./NewBuildingNotice";

export type NewBuildingValues = { name: string; address: string; max_tenants: string; admin_email: string };
export type NewBuildingFormViewProps = {
  form: NewBuildingValues;
  step: number;
  loading: boolean;
  outcome: Exclude<NewBuildingOutcome, { kind: "created" }> | null;
  onChange?: (patch: Partial<NewBuildingValues>) => void;
  onStep?: (step: number) => void;
  onSubmit?: () => void;
};

export function NewBuildingFormView({ form, step, loading, outcome, onChange, onStep, onSubmit }: NewBuildingFormViewProps) {
  // הבניין כבר נפתח (ראש הוועד לא מונה) — בלי "צור בניין" שני; הפעולה הבאה היא "לדף הבניין" בתוך ההודעה.
  const created = createLocked(outcome);
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
          <button key={s} type="button" onClick={() => onStep?.(s)} style={{
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

      <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {step === 1 ? (
          <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <Building2 size={18} style={{ color: "var(--blue)" }} />
              <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)" }}>פרטי הבניין</span>
            </div>
            <div>
              <label style={label}>שם הבניין *</label>
              <input value={form.name} onChange={e => onChange?.({ name: e.target.value })}
                required placeholder="מגדל השלום 1" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>
            <div>
              <label style={label}>כתובת</label>
              <input value={form.address} onChange={e => onChange?.({ address: e.target.value })}
                placeholder="רחוב הרצל 1, תל אביב" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>
            <div>
              <label style={label}>מקסימום דיירים</label>
              <input type="number" value={form.max_tenants} onChange={e => onChange?.({ max_tenants: e.target.value })}
                min="1" max="500" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>
            <div data-plan-moved-note="" style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--surface)", fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }}>
              <Gift size={16} color="var(--blue)" style={{ flexShrink: 0, marginTop: "3px" }} />
              <span>הבניין נפתח בלי מסלול. מסלול בלי חיוב (פיילוט, בניין בדיקות) — מהכרטיס &quot;מסלול בלי חיוב&quot; בדף הבניין, אחרי היצירה.</span>
            </div>
            <button type="button" onClick={() => onStep?.(2)}
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

            <div style={{ background: "#3b82f610", border: "1px solid #3b82f630", borderRadius: "8px", padding: "12px 14px", fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }}>
              אם יש ב-bloc חשבון עם המייל הזה, הוא ימונה לראש הוועד של הבניין ויקבל התראה. החשבון שלו בבניינים אחרים לא משתנה.
              <br />אם אין חשבון, הבניין ייפתח בלי ועד: שלחו לראש הוועד את קוד ההצטרפות, ומנו אותו מהדף שלו אחרי שיצטרף. אפשר גם לדלג.
              <br />מינוי ראש ועד מאושר בקוד חד-פעמי שנשלח למייל שלך (תקף 10 דקות).
            </div>

            <div>
              <label style={label}>כתובת מייל</label>
              <input type="email" value={form.admin_email} onChange={e => onChange?.({ admin_email: e.target.value })}
                placeholder="admin@building.co.il" style={inp}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--blue)"}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"} />
            </div>

            {outcome && <NewBuildingNoticeView outcome={outcome} />}

            {!created && <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={() => onStep?.(1)} style={{ flex: 1, padding: "13px", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "14px", fontWeight: "500", cursor: "pointer" }}>
                → חזרה
              </button>
              <button type="submit" disabled={loading} style={{ flex: 2, padding: "13px", borderRadius: "8px", border: "none", background: loading ? "var(--border)" : "var(--text)", color: loading ? "var(--text-3)" : "var(--bg)", fontSize: "15px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "יוצר..." : "צור בניין"}
              </button>
            </div>}
          </div>
        )}
      </form>
    </div>
  );
}
