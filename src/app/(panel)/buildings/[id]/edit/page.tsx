"use client";
// עריכת בניין — שם, כתובת, מקסימום דיירים. PANEL-PAY א1 (החלטה 363): בלי מסלול; מסלול בלי חיוב — מהכרטיס בדף הבניין.
// PANEL-PAY א2 (החלטה 367): השמירה רצה ב-bloc, עם הפרטים כפי שנטענו (expected) — אם מישהו שינה את הבניין בינתיים, bloc
// עונה 409 changed והמסך אומר לרענן, במקום לדרוס.
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { BuildingEditFormView, editBody, type EditFormValues } from "@/components/ui/BuildingEditForm";

export default function EditBuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [form, setForm] = useState<EditFormValues>({ name: "", address: "", max_tenants: "50" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loaded, setLoaded] = useState<{ name: string; address: string | null; max_tenants: number | null } | null>(null);

  useEffect(() => {
    fetch(`/api/buildings/${id}`, { credentials: "include" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.data) {
          setForm({ name: j.data.name ?? "", address: j.data.address ?? "", max_tenants: String(j.data.max_tenants ?? 50) });
          setLoaded({ name: j.data.name ?? "", address: j.data.address ?? null, max_tenants: typeof j.data.max_tenants === "number" ? j.data.max_tenants : null });
        } else {
          setLoadError(j.error ? "לא הצלחנו לטעון את פרטי הבניין. רעננו את הדף." : "הבניין לא נמצא.");
        }
      })
      .catch(() => setLoadError("אין חיבור לשרת. רעננו את הדף."))
      .finally(() => setFetching(false));
  }, [id]);

  async function handleSubmit() {
    setLoading(true); setError(""); setSuccess(false);
    try {
      const res = await fetch(`/api/buildings/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editBody(form), ...(loaded ? { expected: loaded } : {}) }),
      });
      if (res.ok) { setSuccess(true); setTimeout(() => router.push(`/buildings/${id}`), 1000); }
      else { const j = await res.json().catch(() => ({})); setError(j.error ?? "השמירה נכשלה. נסו שוב."); }
    } catch { setError("אין חיבור לשרת. נסו שוב."); }
    setLoading(false);
  }

  if (fetching) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "var(--text-3)" }}>טוען...</div>
  );
  // כשל בטעינה — נאמר, לא טופס ריק שאפשר לשמור עליו שם ריק.
  if (loadError) return (
    <div role="alert" className="card" style={{ padding: "16px", color: "var(--red)", fontSize: "14.5px", maxWidth: "500px" }}>{loadError}</div>
  );

  return (
    <BuildingEditFormView id={id} form={form} loading={loading} error={error} success={success}
      onChange={(patch) => setForm((p) => ({ ...p, ...patch }))} onSubmit={() => void handleSubmit()} />
  );
}
