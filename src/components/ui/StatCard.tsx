import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string; value: string|number; total?: number;
  icon: LucideIcon; color: "blue"|"green"|"yellow"|"red"|"muted";
  href?: string; alert?: boolean;
}
const C = { blue:"#3b82f6", green:"#22c55e", yellow:"#eab308", red:"#ef4444", muted:"#52525b" };

export default function StatCard({ label, value, total, icon: Icon, color, href, alert }: Props) {
  const c = C[color];
  const inner = (
    <div style={{
      background: "var(--card)",
      borderRadius: "12px",
      padding: "18px",
      border: `1px solid ${alert ? c + "50" : "var(--border)"}`,
      position: "relative",
      overflow: "hidden",
      height: "100%",
    }}>
      {/* Alert top line */}
      {alert && (
        <div style={{
          position: "absolute", top: 0, right: 0, left: 0, height: "3px",
          background: `linear-gradient(90deg, transparent, ${c}, transparent)`,
        }}/>
      )}
      {/* Alert glow bg */}
      {alert && (
        <div style={{
          position: "absolute", top: 0, right: 0, left: 0, bottom: 0,
          background: `radial-gradient(ellipse at top, ${c}08, transparent 70%)`,
          pointerEvents: "none",
        }}/>
      )}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"12px", position:"relative" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:"11px", fontWeight:"600", color:"var(--text-3)", textTransform:"uppercase", letterSpacing:".07em", marginBottom:"12px" }}>
            {label}
          </p>
          <p style={{ fontSize:"28px", fontWeight:"700", color: alert ? c : "var(--text)", letterSpacing:"-.04em", lineHeight:1 }}>
            {value}
          </p>
          {total !== undefined && (
            <p style={{ fontSize:"12px", color:"var(--text-3)", marginTop:"6px" }}>/ {total} סה״כ</p>
          )}
        </div>
        <div style={{
          width:"40px", height:"40px", borderRadius:"10px",
          background: alert ? c+"20" : c+"15",
          border: alert ? `1px solid ${c}40` : "none",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        }}>
          <Icon size={18} color={c} strokeWidth={alert ? 2.5 : 1.8}/>
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href} style={{ display:"block", textDecoration:"none", height:"100%" }}>{inner}</Link>;
  return inner;
}
