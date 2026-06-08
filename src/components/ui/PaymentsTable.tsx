"use client";
import { useState } from "react";
import { Search, Download, Lock } from "lucide-react";
import type { PanelPayment } from "@/types";

const STATUS: Record<string, { label: string; badge: string }> = {
  paid:      { label: "שולם",  badge: "badge-green" },
  pending:   { label: "ממתין", badge: "badge-yellow" },
  failed:    { label: "נכשל",  badge: "badge-red" },
  cancelled: { label: "בוטל",  badge: "badge-muted" },
};

const FILTERS = ["הכל", "שולם", "ממתין", "נכשל", "בוטל"];
const FM: Record<string, string> = { "הכל": "", "שולם": "paid", "ממתין": "pending", "נכשל": "failed", "בוטל": "cancelled" };

function exportCSV(data: PanelPayment[]) {
  const rows = [
    ["ID", "בניין", "דייר", "דירה", "סכום", "סטטוס", "תאריך"].join(","),
    ...data.map(p => [p.id, p.building_name, p.tenant_name ?? "", p.apartment_display, p.amount, p.status, new Date(p.created_at).toLocaleDateString("he-IL")].join(","))
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "payments.csv"; a.click();
}

export default function PaymentsTable({ initialData }: { initialData: PanelPayment[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("הכל");

  const filtered = initialData.filter(p => {
    const ms = (p.building_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.tenant_name ?? "").toLowerCase().includes(search.toLowerCase());
    return ms && (filter === "הכל" || p.status === FM[filter]);
  });

  const total = filtered.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
            <input className="input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש..." style={{ paddingRight: "38px", height: "44px", fontSize: "14px" }} />
          </div>
          <button className="btn btn-ghost" onClick={() => exportCSV(filtered)} style={{ height: "44px", whiteSpace: "nowrap" }}>
            <Download size={15} />ייצוא CSV
          </button>
        </div>
        <div className="chips">
          {FILTERS.map(f => (
            <button key={f} className={`chip${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)} style={{ fontSize: "13px", padding: "7px 16px" }}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
          {filtered.length} תשלומים ·
          <span style={{ color: "var(--green)", marginRight: "6px", fontWeight: "600" }}>
            ₪{(total).toLocaleString("he-IL")} שולם
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>בניין</th>
              <th>דייר</th>
              <th>דירה</th>
              <th>סכום</th>
              <th>תיאור</th>
              <th>סטטוס</th>
              <th>תאריך</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const sc = STATUS[p.status] ?? STATUS.pending;
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: "500", color: "var(--text)" }}>{p.building_name}</td>
                  <td style={{ color: "var(--text-2)" }}>{p.tenant_name ?? "—"}</td>
                  <td>
                    {p.apartment_display === "🔒"
                      ? <span style={{ color: "var(--text-3)", display: "flex", alignItems: "center", gap: "4px" }}><Lock size={11} /></span>
                      : <span style={{ color: "var(--text-2)" }}>{p.apartment_display}</span>
                    }
                  </td>
                  <td>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: "600", fontSize: "13px", color: "var(--text)" }}>
                      ₪{(p.amount).toLocaleString("he-IL")}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-3)", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.description ?? "—"}
                  </td>
                  <td><span className={`badge ${sc.badge}`}>{sc.label}</span></td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-3)" }}>
                    {new Date(p.created_at).toLocaleDateString("he-IL")}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="empty">לא נמצאו תשלומים</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
