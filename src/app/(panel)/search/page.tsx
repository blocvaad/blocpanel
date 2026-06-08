"use client";
import { useState, useCallback } from "react";
import { Search, Building2, Users, CreditCard, Wrench } from "lucide-react";
import Link from "next/link";

interface Result {
  type: "building" | "tenant" | "payment" | "ticket";
  id: string;
  title: string;
  sub: string;
  href: string;
  badge?: string;
  badgeColor?: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const json = await res.json();
      setResults(json.results ?? []);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    search(e.target.value);
  }

  const ICONS = { building: Building2, tenant: Users, payment: CreditCard, ticket: Wrench };
  const COLORS = { building: "var(--blue)", tenant: "var(--green)", payment: "var(--yellow)", ticket: "var(--red)" };
  const LABELS = { building: "בניין", tenant: "דייר", payment: "תשלום", ticket: "תקלה" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", letterSpacing: "-.03em" }}>חיפוש גלובלי</h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>חפש בכל הבניינים, דיירים, תשלומים ותקלות</p>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={18} style={{ position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input
          className="input"
          value={query}
          onChange={handleChange}
          placeholder="הקלד לחיפוש..."
          autoFocus
          style={{ paddingRight: "48px", fontSize: "16px", height: "52px" }}
        />
        {loading && (
          <div style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "var(--text-3)" }}>
            מחפש...
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "4px" }}>{results.length} תוצאות</div>
          {results.map(r => {
            const Icon = ICONS[r.type];
            const color = COLORS[r.type];
            return (
              <Link key={r.id} href={r.href} style={{ textDecoration: "none" }}>
                <div className="card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "14px", transition: "border-color .15s" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={17} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>{r.sub}</div>
                  </div>
                  <span className="badge badge-muted" style={{ fontSize: "11px", flexShrink: 0 }}>{LABELS[r.type]}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {query.length >= 2 && !loading && results.length === 0 && (
        <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-3)" }}>
          לא נמצאו תוצאות עבור "{query}"
        </div>
      )}

      {query.length === 0 && (
        <div className="card" style={{ padding: "32px", textAlign: "center" }}>
          <Search size={32} style={{ color: "var(--text-3)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: "14px", color: "var(--text-3)" }}>הקלד לפחות 2 תווים לחיפוש</div>
        </div>
      )}
    </div>
  );
}
