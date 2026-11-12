// מחלוקות התשלום של ספק בפאנל (LEDGER-1b): הספירה מהשרת — רק על רשומה חיה (מחלוקת על סימון שבוטל אינה פתוחה);
// קריאה שנכשלה — אומרים שלא נטען, לא "אין".
export function DisputesBadge({ count }: { count: number | null }) {
  if (count === null || count <= 0) return null;
  return <span data-open-disputes={count} style={{ color: "var(--red)" }}>{count} מחלוקות תשלום פתוחות</span>;
}

export function DisputesFailedNotice({ failed }: { failed: boolean }) {
  if (!failed) return null;
  return (
    <div data-disputes-failed="" className="card" style={{ padding: "12px 16px", color: "var(--red)", fontSize: "13px" }}>
      מחלוקות התשלום של הספקים לא נטענו — נסו לרענן.
    </div>
  );
}
