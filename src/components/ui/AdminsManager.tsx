"use client";
import { useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";

interface Admin {
  id: string; email: string; full_name: string;
  role: string; is_active: boolean; last_login: string | null; created_at: string;
}

interface Props { admins: Admin[]; currentId: string; isSuperAdmin: boolean; }

export default function AdminsManager({ admins: initial, currentId, isSuperAdmin }: Props) {
  const [admins, setAdmins] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Admin & { password: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  function startEdit(a: Admin) {
    setEditing(a.id);
    setEditForm({ full_name: a.full_name, role: a.role, is_active: a.is_active, password: "" });
  }

  async function saveEdit(id: string) {
    setLoading(id);
    const body: Record<string, unknown> = { full_name: editForm.full_name, role: editForm.role, is_active: editForm.is_active };
    if (editForm.password && editForm.password.length >= 8) body.password = editForm.password;
    const res = await fetch(`/api/settings/admin/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setLoading(null);
    if (res.ok) { setAdmins(p => p.map(a => a.id === id ? { ...a, ...json.data } : a)); setEditing(null); setMsg({ id, text: "✓ עודכן", ok: true }); }
    else { setMsg({ id, text: json.error ?? "שגיאה", ok: false }); }
    setTimeout(() => setMsg(null), 3000);
  }

  async function deleteAdmin(a: Admin) {
    if (!confirm(`למחוק את ${a.full_name}?`)) return;
    setLoading(a.id);
    const res = await fetch(`/api/settings/admin/${a.id}`, { method: "DELETE" });
    const json = await res.json();
    setLoading(null);
    if (res.ok) { setAdmins(p => p.filter(x => x.id !== a.id)); }
    else { setMsg({ id: a.id, text: json.error ?? "שגיאה", ok: false }); setTimeout(() => setMsg(null), 3000); }
  }

  const inputStyle = { background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "6px", padding: "8px 10px", fontSize: "13px", color: "var(--text)", outline: "none", fontFamily: "inherit", width: "100%" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {admins.map(a => {
        const isEditing = editing === a.id;
        const isMe = a.id === currentId;
        const isLoading = loading === a.id;
        const m = msg?.id === a.id ? msg : null;
        return (
          <div key={a.id} style={{ padding: "14px", borderRadius: "10px", background: "var(--surface)", border: `1px solid ${isEditing ? "var(--border-2)" : "var(--border)"}`, transition: "border-color .15s" }}>
            {!isEditing ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0, background: "#3b82f620", border: "1px solid #3b82f640", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--blue)" }}>{a.full_name.charAt(0)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", display: "flex", alignItems: "center", gap: "6px" }}>
                    {a.full_name}
                    {isMe && <span style={{ fontSize: "10px", color: "var(--blue)", background: "#3b82f618", padding: "1px 6px", borderRadius: "99px" }}>אתה</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "1px" }}>{a.email}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", fontFamily: "var(--mono)", padding: "3px 8px", borderRadius: "6px", background: "var(--card)", border: "1px solid var(--border)", color: a.role === "superadmin" ? "var(--yellow)" : a.role === "admin" ? "var(--blue)" : "var(--text-3)" }}>{a.role}</span>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: a.is_active ? "var(--green)" : "var(--text-3)", flexShrink: 0 }} />
                  {isSuperAdmin && !isMe && (
                    <>
                      <button onClick={() => startEdit(a)} disabled={isLoading} title="עריכה" style={{ width: "30px", height: "30px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Pencil size={13} /></button>
                      <button onClick={() => deleteAdmin(a)} disabled={isLoading} title="מחיקה" style={{ width: "30px", height: "30px", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".05em" }}>שם מלא</div>
                    <input value={editForm.full_name ?? ""} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".05em" }}>תפקיד</div>
                    <select value={editForm.role ?? "admin"} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="viewer">viewer</option>
                      <option value="admin">admin</option>
                      <option value="superadmin">superadmin</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".05em" }}>סיסמה חדשה (אופציונלי)</div>
                    <input type="password" value={editForm.password ?? ""} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} placeholder="8+ תווים" style={inputStyle} />
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".05em" }}>סטטוס</div>
                    <select value={editForm.is_active ? "active" : "inactive"} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.value === "active" }))} style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="active">פעיל</option>
                      <option value="inactive">מושבת</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button onClick={() => saveEdit(a.id)} disabled={isLoading} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "7px", border: "none", background: "var(--text)", color: "var(--bg)", fontSize: "13px", fontWeight: "600", cursor: "pointer", opacity: isLoading ? .6 : 1 }}>
                    <Check size={14} />{isLoading ? "שומר..." : "שמור"}
                  </button>
                  <button onClick={() => setEditing(null)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-3)", fontSize: "13px", cursor: "pointer" }}>
                    <X size={14} />ביטול
                  </button>
                  {m && <span style={{ fontSize: "13px", color: m.ok ? "var(--green)" : "var(--red)", fontWeight: "500" }}>{m.text}</span>}
                </div>
              </div>
            )}
            {m && !isEditing && <div style={{ marginTop: "8px", fontSize: "12px", color: m.ok ? "var(--green)" : "var(--red)" }}>{m.text}</div>}
          </div>
        );
      })}
    </div>
  );
}
