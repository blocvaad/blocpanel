"use client";
// src/components/ui/NewBuildingNotice.tsx — מה קרה אחרי "צור בניין" (PANEL-PAY א2, החלטה 367).
//
// bloc פותח את הבניין וממנה את ראש הוועד באותה בקשה. מינוי שלא הצליח משאיר בניין תקין בלי ועד — המסך אומר את שני הדברים
// על מסילה (נפתח ✓ / ראש הוועד לא מונה !), למה, ואת קוד ההצטרפות לשלוח לראש הוועד. תשובה לא ברורה — "ייתכן שנוצר",
// עם קישור לרשימת הבניינים (ניסיון חוזר בלי לבדוק עלול לפתוח בניין שני). התצוגה בלבד — לבדיקה בשרת ולצילומי המסך.
import Link from "next/link";
import { Check, AlertTriangle, ChevronLeft } from "lucide-react";
import type { NewBuildingOutcome } from "@/lib/blocActionsUi";

type Shown = Exclude<NewBuildingOutcome, { kind: "created" }>;

const dot = (bg: string, fg: string): React.CSSProperties => ({
  width: "26px", height: "26px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
  background: bg, color: fg, flexShrink: 0, position: "relative", zIndex: 1,
});

export function NewBuildingNoticeView({ outcome }: { outcome: Shown }) {
  if (outcome.kind === "error") {
    return (
      <div role="alert" data-new-building-error={outcome.unclear ? "unclear" : "plain"} style={{ padding: "12px 14px", borderRadius: "10px", background: "#ef444414", border: "1px solid #ef444440", fontSize: "14px", color: "var(--text)", lineHeight: 1.6 }}>
        {outcome.text}
        {outcome.unclear && (
          <div style={{ marginTop: "8px" }}>
            <Link href="/buildings" style={{ color: "var(--blue)", fontWeight: 600 }}>לרשימת הבניינים</Link>
          </div>
        )}
      </div>
    );
  }
  return (
    <div role="status" data-new-building-founder="failed" style={{ borderRadius: "14px", border: "1px solid #eab30855", background: "var(--card)", overflow: "hidden" }}>
      <ol aria-label="מה קרה" style={{ listStyle: "none", margin: 0, padding: "14px 16px 4px", display: "flex", flexDirection: "column", gap: 0 }}>
        <li style={{ display: "flex", gap: "12px", position: "relative", paddingBottom: "14px" }}>
          <span aria-hidden style={{ position: "absolute", insetInlineStart: "12px", top: "26px", bottom: 0, width: "2px", background: "var(--border-2)" }} />
          <span aria-hidden style={dot("#22c55e", "#fff")}><Check size={15} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>הבניין נפתח</div>
            <div style={{ fontSize: "13.5px", color: "var(--text-2)" }} data-new-building-name="">&quot;{outcome.name}&quot;</div>
          </div>
        </li>
        <li style={{ display: "flex", gap: "12px", paddingBottom: "12px" }}>
          <span aria-hidden style={dot("#eab30826", "#eab308")}><AlertTriangle size={15} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)" }}>ראש הוועד לא מונה</div>
            <div style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.6 }} data-new-building-founder-why="">{outcome.message}</div>
          </div>
        </li>
      </ol>
      {outcome.inviteCode && (
        <div data-new-building-invite="" style={{ margin: "0 16px 12px", padding: "10px 12px", borderRadius: "10px", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", color: "var(--text-3)" }}>קוד ההצטרפות לבניין</span>
          <code dir="ltr" style={{ fontFamily: "var(--mono)", fontSize: "16px", fontWeight: 700, color: "var(--text)", letterSpacing: ".06em" }}>{outcome.inviteCode}</code>
        </div>
      )}
      <div style={{ padding: "0 16px 14px" }}>
        <Link href={`/buildings/${outcome.id}`} data-new-building-open="" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "46px", borderRadius: "10px", background: "var(--text)", color: "var(--bg)", fontSize: "14.5px", fontWeight: 700, textDecoration: "none" }}>
          לדף הבניין <ChevronLeft size={16} />
        </Link>
      </div>
    </div>
  );
}
