import { adminClient } from "@/lib/supabase";
import { requirePageSession } from "@/lib/pageAuth";
import { AUDIT_LABELS as AL } from "@/lib/auditLabels";
import { can } from "@/lib/permissions";
import { reportRowsFilter } from "@/lib/dmReports";
export const dynamic = "force-dynamic";

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s/60)} דקות`;
  if (s < 86400) return `לפני ${Math.floor(s/3600)} שעות`;
  return new Date(d).toLocaleDateString("he-IL", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
}

export default async function LogsPage() {
  const session = await requirePageSession();
  let q = adminClient
    .from("panel_audit_logs")
    // S345 (שלב 4): רק מה שהמסך מציג (בלי כתובת ה-IP של הצוות — היא במסך האבטחה)
    .select("id, action, admin_email, entity_type, entity_id, metadata, created_at", { count: "exact" });
  // MOD-1 (סקירה #7): פעולות על דיווחים על שיחות פרטיות — רק למי שרואה דיווחים (viewer לא יודע אפילו שיש); bloc SAFETY-1 (סקירה #14):
  // גם הפעולות על דיווחים על תוכן. מסנן אחד לשני הסוגים.
  const hidden = reportRowsFilter(can(session.role, "dm_reports.read"), can(session.role, "content_reports.read"));
  if (hidden) q = q.or(hidden);
  const { data: logs, count } = await q
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>לוג פעולות</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>{count ?? 0} פעולות נרשמו</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {(logs ?? []).map(log => {
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
                {log.entity_id && (
                  <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)", marginTop: "2px" }}>
                    {log.entity_id.slice(0, 12)}…
                  </div>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", flexShrink: 0, textAlign: "left" }}>
                {timeAgo(log.created_at)}
              </div>
            </div>
          );
        })}
        {(logs ?? []).length === 0 && (
          <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>אין פעולות מתועדות</div>
        )}
      </div>
    </div>
  );
}
