"use client";
// העברת בניין לארכיון מדף הבניין (סופר-אדמין). קודם: confirm() של הדפדפן שאמר "פעולה בלתי הפיכה",
// ובקשת DELETE בלי גוף — שהשרת דחה (400), בלי שום הודעה. עכשיו: אותו חלון כמו ברשימת הבניינים (סיבה +
// הקלדת שם הבניין), והודעה ברורה אם נכשל.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import DeleteBuildingModal from "./DeleteBuildingModal";

export default function BuildingActions({ buildingId, buildingName }: { buildingId: string; buildingName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function archive(reason: string) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/buildings/${buildingId}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) { router.push("/buildings"); router.refresh(); return; }
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "ההעברה לארכיון נכשלה. נסו שוב.");
    } catch {
      setError("אין חיבור לשרת. נסו שוב.");
    }
    setLoading(false);
  }

  return (
    <div style={{ position: "relative" }}>
      {open && <DeleteBuildingModal buildingName={buildingName} onConfirm={(reason) => void archive(reason)} onCancel={() => setOpen(false)} />}
      <button onClick={() => setOpen(true)} disabled={loading} title="העברה לארכיון" aria-label={`העברת ${buildingName} לארכיון`} data-building-archive="" style={{
        width: "44px", height: "44px", borderRadius: "8px", border: "1px solid var(--border)",
        background: "transparent", color: "var(--text-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .5 : 1,
      }}>
        <Archive size={17} />
      </button>
      {error && (
        <div role="alert" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "260px", zIndex: 20, padding: "10px 12px", borderRadius: "10px", background: "#ef444418", border: "1px solid #ef444440", color: "var(--text)", fontSize: "13.5px", lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}
