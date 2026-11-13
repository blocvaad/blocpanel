"use client";
// העברת בניין לארכיון מדף הבניין (סופר-אדמין). קודם: confirm() של הדפדפן שאמר "פעולה בלתי הפיכה",
// ובקשת DELETE בלי גוף — שהשרת דחה (400), בלי שום הודעה. עכשיו: אותו חלון כמו ברשימת הבניינים (סיבה +
// הקלדת שם הבניין), והודעה ברורה אם נכשל.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import DeleteBuildingModal from "./DeleteBuildingModal";
import LiveSubscriptionDialog, { StopTaskFailedNotice, parseLiveConflict, type LiveSubscriptionConflict } from "./LiveSubscriptionDialog";

export default function BuildingActions({ buildingId, buildingName }: { buildingId: string; buildingName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BILL-1b: 409 LIVE_SUBSCRIPTION → דיאלוג; אישור → אותה בקשה עם confirm_live_subscription:true.
  const [live, setLive] = useState<{ reason: string; conflict: LiveSubscriptionConflict; busy: boolean; error: string | null } | null>(null);
  const [stopFailed, setStopFailed] = useState(false);
  const router = useRouter();

  async function archive(reason: string, confirmLive = false) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/buildings/${buildingId}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, ...(confirmLive ? { confirm_live_subscription: true } : {}) }),
      });
      const j = await res.json().catch(() => ({}));
      const conflict = confirmLive ? null : parseLiveConflict(res.status, j);
      if (conflict) { setLive({ reason, conflict, busy: false, error: null }); setLoading(false); return; }
      if (res.ok) {
        setLive(null);
        // הארכוב בוצע אבל משימת העצירה לא נפתחה — נשארים בדף עם אזהרה בולטת (ניווט היה מעלים אותה).
        if (j.stop_task === "failed") { setStopFailed(true); setLoading(false); return; }
        router.push("/buildings"); router.refresh(); return;
      }
      if (confirmLive) setLive((d) => d && { ...d, busy: false, error: j.error ?? "ההעברה לארכיון נכשלה. נסו שוב." });
      else setError(j.error ?? "ההעברה לארכיון נכשלה. נסו שוב.");
    } catch {
      if (confirmLive) setLive((d) => d && { ...d, busy: false, error: "אין חיבור לשרת. נסו שוב." });
      else setError("אין חיבור לשרת. נסו שוב.");
    }
    setLoading(false);
  }

  function confirmLiveDialog() {
    if (!live || live.busy) return;
    const reason = live.reason;
    setLive({ ...live, busy: true, error: null });
    void archive(reason, true);
  }

  return (
    <div style={{ position: "relative" }}>
      {live && <LiveSubscriptionDialog owner="building" conflict={live.conflict} busy={live.busy} error={live.error} onConfirm={confirmLiveDialog} onCancel={() => setLive(null)} />}
      {open && <DeleteBuildingModal buildingName={buildingName} onConfirm={(reason) => void archive(reason)} onCancel={() => setOpen(false)} />}
      <button onClick={() => setOpen(true)} disabled={loading} title="העברה לארכיון" aria-label={`העברת ${buildingName} לארכיון`} data-building-archive="" style={{
        width: "44px", height: "44px", borderRadius: "8px", border: "1px solid var(--border)",
        background: "transparent", color: "var(--text-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .5 : 1,
      }}>
        <Archive size={17} />
      </button>
      {stopFailed && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "300px", zIndex: 20 }}>
          <StopTaskFailedNotice onClose={() => { setStopFailed(false); router.push("/buildings"); router.refresh(); }} />
        </div>
      )}
      {error && (
        <div role="alert" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, width: "260px", zIndex: 20, padding: "10px 12px", borderRadius: "10px", background: "#ef444418", border: "1px solid #ef444440", color: "var(--text)", fontSize: "13.5px", lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}
