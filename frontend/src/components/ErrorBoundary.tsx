import React, { Component, ErrorInfo, ReactNode } from "react";
import { FileWarning } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="centered" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-0)" }}>
          <div className="error-box" style={{ maxWidth: "500px", padding: "var(--sp-8)" }}>
            <FileWarning size={32} style={{ color: "var(--error)", marginBottom: "var(--sp-4)" }} />
            <div className="mono-data" style={{ color: "var(--error)", marginBottom: "var(--sp-2)", fontSize: "var(--text-14)" }}>
              Something went wrong.
            </div>
            <div className="mono-data" style={{ color: "var(--fg-2)", marginBottom: "var(--sp-6)", fontSize: "var(--text-12)", wordBreak: "break-word" }}>
              {this.state.error?.message}
            </div>
            <button className="btn-secondary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
