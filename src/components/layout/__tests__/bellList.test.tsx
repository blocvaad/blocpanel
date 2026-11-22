// MOD-1 (bloc MG-S1179; סקירה #19): הפעמון נושא עכשיו גם את ההתראה על דיווח חדש על שיחה פרטית. קריאה שנכשלה — "לא נטענו" (לא
// "אין התראות"); משיכה חוזרת או כשל לא מעלימים רשימה שכבר נטענה; כל שורה היא כפתור (מקלדת), ושורת דיווח — עם האייקון שלה.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/overview", useRouter: () => ({ push: () => {} }) }));
vi.mock("@/hooks/usePoll", () => ({ usePoll: () => {} }));
import TopBar, { BellList, type Notif } from "../TopBar";

const row: Notif = { id: "n1", type: "dm_report", title: "דיווח חדש על שיחה פרטית", content: "איום או הפחדה · 2 הודעות, אחת אומתה", link: "/dm-reports/r1", is_read: false, created_at: new Date().toISOString() };
const html = (p: { loading?: boolean; failed?: boolean; notifs?: Notif[] }) =>
  renderToStaticMarkup(createElement(BellList, { loading: false, failed: false, notifs: [], onPick: () => {}, ...p }));

describe("the bell list", () => {
  it("failed with nothing loaded — said, never 'no notifications'; empty — 'no notifications'; loading — 'loading'", () => {
    const failed = html({ failed: true });
    expect(failed).toContain("ההתראות לא נטענו. נסו שוב בעוד רגע.");
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain("אין התראות");
    expect(html({})).toContain("אין התראות");
    expect(html({ loading: true })).toContain("טוען...");
  });

  it("a list already loaded stays through a poll and through a failed read", () => {
    for (const p of [{ loading: true }, { failed: true }, { loading: true, failed: true }]) {
      const out = html({ ...p, notifs: [row] });
      expect(out).toContain("דיווח חדש על שיחה פרטית");
      expect(out).not.toContain("טוען...");
      expect(out).not.toContain("ההתראות לא נטענו");
    }
  });

  it("the bell button has a name and says whether the list is open", () => {
    const out = renderToStaticMarkup(createElement(TopBar, { admin: { id: "a", email: "t@bloc.co.il", full_name: "ט", role: "admin" } as never, onMenuClick: () => {} }));
    expect(out).toContain('aria-label="התראות"');
    expect(out).toContain('aria-expanded="false"');
  });

  it("every row is a button; a report row carries its icon", () => {
    const out = html({ notifs: [row, { ...row, id: "n2", type: "payment", title: "תשלום", content: "c", is_read: true }] });
    expect(out.match(/<button type="button"/g)).toHaveLength(2);
    expect(out).toContain("💬");
    expect(out).toContain("₪");
  });
});
