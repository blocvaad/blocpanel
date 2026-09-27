// src/lib/rpc.ts — קריאה ל-RPC של bloc שאולי עוד לא הורץ (פריסת הפאנל לפני המיגרציה).
// PGRST202 = הפונקציה לא בסכמה של PostgREST; 42883 = לא קיימת ב-Postgres.
export type RpcError = { code?: string; message?: string } | null | undefined;

export function isMissingRpc(e: RpcError): boolean {
  return !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));
}
