"use client";

const AL: Record<string, { label: string; color: string; bg: string }> = {
  BLOCK_TENANT:    { label:"חסימת דייר",  color:"#ef4444", bg:"#ef444418" },
  APPROVE_TENANT:  { label:"אישור דייר",  color:"#22c55e", bg:"#22c55e18" },
  UPDATE_TENANT:   { label:"עדכון דייר",  color:"#3b82f6", bg:"#3b82f618" },
  UPDATE_BUILDING: { label:"עדכון בניין", color:"#3b82f6", bg:"#3b82f618" },
  DELETE_BUILDING: { label:"מחיקת בניין",color:"#ef4444", bg:"#ef444418" },
  CREATE_ADMIN:    { label:"מנהל חדש",   color:"#eab308", bg:"#eab30818" },
};

function ago(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s/60)}ד׳`;
  if (s < 86400) return `לפני ${Math.floor(s/3600)}ש׳`;
  return `לפני ${Math.floor(s/86400)}י׳`;
}

interface Log { id:string; action:string; admin_email:string|null; entity_type:string|null; created_at:string; }

export default function RecentActivity({ logs }: { logs: Log[] }) {
  if (logs.length === 0) {
    return (
      <div className="card" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>
        אין פעילות עדיין
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {logs.map(log => {
        const meta = AL[log.action];
        return (
          <div key={log.id} className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              padding: "6px 12px", borderRadius: "6px", flexShrink: 0,
              background: meta?.bg ?? "#52525b18",
              color: meta?.color ?? "var(--text-3)",
              fontSize: "13px", fontWeight: "600",
            }}>
              {meta?.label ?? log.action}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.admin_email ?? "system"}
              </div>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-3)", flexShrink: 0, fontFamily: "var(--mono)" }}>
              {ago(log.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
