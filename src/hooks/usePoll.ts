"use client";
import { useEffect, useRef } from "react";

// משיכה תקופתית שנעצרת כשהלשונית מוסתרת ומושכת מיד כשחוזרים אליה.
export function usePoll(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { void fnRef.current(); };
    const start = () => { if (!timer) timer = setInterval(tick, intervalMs); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.hidden) stop(); else { tick(); start(); } };

    tick();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [intervalMs, enabled]);
}
