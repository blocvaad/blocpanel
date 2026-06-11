export function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div className="card" style={{ padding: "18px", height, overflow: "hidden", position: "relative" }}>
      <div className="skeleton-shimmer" />
    </div>
  );
}

export function SkeletonStatGrid() {
  return (
    <div className="stat-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonCard key={i} height={90} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} height={72} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="table-wrap">
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
        <div className="card" style={{ padding: "12px 18px", height: 44, position: "relative", overflow: "hidden", borderRadius: "10px 10px 0 0" }}>
          <div className="skeleton-shimmer" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ padding: "12px 18px", height: 52, background: "var(--card)", position: "relative", overflow: "hidden", borderBottom: "1px solid var(--border)" }}>
            <div className="skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
