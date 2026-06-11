"use client";
import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; eventId: string | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, eventId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    const eventId = Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    this.setState({ eventId });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "48px 24px", gap: "16px", textAlign: "center",
      }}>
        <div style={{
          width: "52px", height: "52px", borderRadius: "14px",
          background: "#ef444418", border: "1px solid #ef444430",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={24} color="#ef4444" />
        </div>
        <div>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "6px" }}>
            משהו השתבש
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "4px" }}>
            השגיאה דווחה אוטומטית
          </div>
          {this.state.eventId && (
            <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--mono)" }}>
              #{this.state.eventId.slice(0, 8)}
            </div>
          )}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, eventId: null })}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 20px", borderRadius: "8px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-2)", fontSize: "14px", cursor: "pointer",
          }}>
          <RefreshCw size={14} />
          נסה שוב
        </button>
      </div>
    );
  }
}
