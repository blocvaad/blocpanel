"use client";
import { useState, useEffect } from "react";
import { ArrowLeftRight } from "lucide-react";
import TransferTenantModal from "./TransferTenantModal";

interface Building { id: string; name: string; }

export default function TransferTenantWrapper({ tenantId, tenantName, currentBuildingId }: { tenantId: string; tenantName: string; currentBuildingId: string }) {
  const [open, setOpen] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);

  useEffect(() => {
    if (open && buildings.length === 0) {
      fetch("/api/buildings", { credentials: "include" })
        .then(r => r.json())
        .then(j => setBuildings(j.data ?? []));
    }
  }, [open]);

  return (
    <>
      {open && (
        <TransferTenantModal
          tenantId={tenantId}
          tenantName={tenantName}
          currentBuildingId={currentBuildingId}
          buildings={buildings}
          onClose={() => setOpen(false)}
        />
      )}
      <button onClick={() => setOpen(true)} style={{
        width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)",
        background: "transparent", color: "var(--text-3)",
        fontSize: "14px", fontWeight: "500", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        marginTop: "8px",
      }}>
        <ArrowLeftRight size={15} />
        העבר לבניין אחר
      </button>
    </>
  );
}
