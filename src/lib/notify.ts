// src/lib/notify.ts — התראה בתוך bloc למשתמש בודד (טבלת notifications של המוצר).
//
// הטבלה היא receiver_id / sender_id — אין בה user_id. הקוד הקודם בפאנל כתב
// user_id, PostgREST החזיר שגיאה (PGRST204) שאף אחד לא בדק, וההתראה לא נשלחה
// בכלל (למשל "חברת הניהול אושרה"). כל שליחה מהפאנל עוברת כאן.
import { adminClient } from "./supabase";

export type UserNotice = { title: string; content: string; link: string; type?: string };

export function noticeRow(receiverId: string, n: UserNotice) {
  return {
    receiver_id: receiverId,
    sender_id: null,
    type: n.type ?? "announcement",
    title: n.title.slice(0, 200),
    content: n.content.slice(0, 500),
    link: n.link,
  };
}

/** best-effort: כשל בהתראה לא מבטל את הפעולה שכבר בוצעה, אבל כן נרשם. */
export async function notifyUser(receiverId: string | null | undefined, n: UserNotice): Promise<boolean> {
  if (!receiverId) return false;
  const { error } = await adminClient.from("notifications").insert(noticeRow(receiverId, n));
  if (error) {
    console.error("[notifyUser] insert failed", { code: error.code, message: error.message });
    return false;
  }
  return true;
}
