"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { stepUpFetch } from "@/lib/stepUpClient";
import { STEP_UP_WHAT, CREATE_NETWORK_TEXT, createLocked, newBuildingOutcome, type NewBuildingOutcome } from "@/lib/blocActionsUi";
import { NewBuildingFormView } from "@/components/ui/NewBuildingForm";

// PANEL-PAY א1 (החלטה 363): בניין חדש נפתח בלי מסלול (ברירת המחדל של ה-DB). מסלול בלי חיוב — מהכרטיס "מסלול בלי חיוב"
// בדף הבניין, אחרי היצירה (סופר-אדמין, עם קוד אישור, דרך bloc).
// PANEL-PAY א2 (החלטה 367): bloc פותח את הבניין וממנה את ראש הוועד באותה בקשה. מינוי שלא הצליח — המסך אומר שהבניין נפתח,
// למה ראש הוועד לא מונה, ואת קוד ההצטרפות (NewBuildingNotice). תשובה לא ברורה — "ייתכן שנוצר", לא הצלחה.

export default function NewBuildingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", address: "", max_tenants: "50",
    admin_email: "",
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  // הבניין נוצר וראש הוועד לא מונה / שגיאה / תשובה לא ברורה — אומרים, ולא ממשיכים בשקט.
  const [outcome, setOutcome] = useState<Exclude<NewBuildingOutcome, { kind: "created" }> | null>(null);
  const created = createLocked(outcome);

  async function handleSubmit() {
    if (created) return;
    setLoading(true); setOutcome(null);
    try {
      // PANEL-PAY א1: עם מייל של ראש ועד השרת מבקש קוד אישור — stepUpFetch פותח את החלון ושולח שוב פעם אחת.
      const res = await stepUpFetch("/api/buildings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, address: form.address, max_tenants: form.max_tenants,
          admin_email: form.admin_email.trim() || undefined,
        }),
      }, { what: STEP_UP_WHAT.create(form.name) });
      const json = await res.json().catch(() => ({}));
      const o = newBuildingOutcome(res, json, form.name);
      if (o.kind === "created") router.push(`/buildings/${o.id}`);
      else setOutcome(o);
    } catch { setOutcome({ kind: "error", text: CREATE_NETWORK_TEXT, unclear: true }); }
    setLoading(false);
  }

  return (
    <NewBuildingFormView form={form} step={step} loading={loading} outcome={outcome}
      onChange={(patch) => setForm((p) => ({ ...p, ...patch }))} onStep={setStep} onSubmit={() => void handleSubmit()} />
  );
}
