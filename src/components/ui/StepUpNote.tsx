"use client";
// src/components/ui/StepUpNote.tsx — שורה בחלונות האישור (ארכוב, השעיה / הפעלה, אימות ספק): הפעולה מאושרת גם בקוד
// חד-פעמי מהמייל (PANEL-PAY א2, החלטה 369). אומרים מראש — כדי שחלון הקוד שנפתח אחרי "אישור" לא יפתיע.
import { ShieldCheck } from "lucide-react";
import { STEP_UP_NOTE } from "@/lib/blocActionsUi";

export default function StepUpNote({ text = STEP_UP_NOTE, style }: { text?: string; style?: React.CSSProperties }) {
  return (
    <div data-stepup-note="" style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12.5px", color: "var(--text-3)", lineHeight: 1.6, ...style }}>
      <ShieldCheck size={15} color="var(--blue)" style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden />
      <span>{text}</span>
    </div>
  );
}
