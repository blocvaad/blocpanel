// dmReports/kit — MOD-1: מה ששני המסכים של הדיווחים על הודעות פרטיות חולקים (התור — רכיב שרת; הדיווח — רכיב לקוח).
import { initialsOf, type DmReason } from "@/lib/dmReports";

export const REASON_TONE: Record<DmReason, "danger" | "wait" | "muted"> = { threat: "danger", harassment: "wait", spam: "muted", other: "muted" };
export const SLA_TONE = { ok: "muted", soon: "wait", late: "danger" } as const;

export function Initials({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border-2)",
      color: "var(--text)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: `${Math.round(size * 0.38)}px`, fontWeight: 700, flexShrink: 0 }}>
      {initialsOf(name)}
    </span>
  );
}
