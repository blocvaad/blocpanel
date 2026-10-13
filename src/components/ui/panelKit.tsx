"use client";
// panelKit — חלקי ממשק משותפים לפאנל (מקורם ב-broadcastKit, UI-R5a), ובקשה ל-/api/members (UI-R5c-1).
export { Section, Modal, Banner, ghostBtn, solidBtn, fieldLabel, type ApiResult } from "./broadcastKit";
import type { ApiResult } from "./broadcastKit";

/** פעולה על אדם (/api/members → bloc). שגיאה — המשפט מהשרת, בעברית. */
export async function postMember<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const r = await fetch("/api/members", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: j.error ?? j.issues?.[0]?.message ?? "הפעולה נכשלה. נסו שוב." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, status: 0, error: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." };
  }
}

export const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: "48px", padding: "0 14px", borderRadius: "10px", border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--text)", fontSize: "15px", outline: "none", fontFamily: "inherit",
};

export const textareaStyle: React.CSSProperties = {
  ...inputStyle, minHeight: "96px", padding: "12px 14px", lineHeight: 1.6, resize: "vertical",
};

/** צ'יפ מצב קטן (טקסט + צבע). */
export function Tag({ tone, children }: { tone: "ok" | "wait" | "danger" | "muted" | "info"; children: React.ReactNode }) {
  const c = tone === "ok" ? "#22c55e" : tone === "wait" ? "#eab308" : tone === "danger" ? "#ef4444" : tone === "info" ? "#3b82f6" : "#a1a1aa";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "99px", fontSize: "13px", fontWeight: 600, background: `${c}18`, color: c, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
