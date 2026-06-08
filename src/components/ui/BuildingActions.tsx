"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function BuildingActions({ buildingId, buildingName }: { buildingId: string; buildingName: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`למחוק את "${buildingName}"? פעולה בלתי הפיכה!`)) return;
    setLoading(true);
    const res = await fetch(`/api/buildings/${buildingId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) router.push("/buildings");
    else setLoading(false);
  }

  return (
    <button onClick={handleDelete} disabled={loading} title="מחק בניין" style={{
      width:"38px",height:"38px",borderRadius:"8px",border:"1px solid var(--border)",
      background:"transparent",color:"var(--text-3)",
      display:"flex",alignItems:"center",justifyContent:"center",
      cursor:loading?"not-allowed":"pointer",opacity:loading?.5:1,
    }}>
      <Trash2 size={16}/>
    </button>
  );
}
