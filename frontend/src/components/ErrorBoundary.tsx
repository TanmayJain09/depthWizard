import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useAppStore } from "../store";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    componentStack: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ componentStack: errorInfo.componentStack || null });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "white", background: "#333", height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <h2>Something went wrong in the viewer.</h2>
          <pre style={{ color: "red", background: "#111", padding: "10px", borderRadius: "5px", overflowX: "auto", maxWidth: "80%", textAlign: "left" }}>
            {this.state.error?.toString()}
            <br />
            {this.state.componentStack}
          </pre>
          <button 
            className="btn-primary" 
            style={{ marginTop: "20px" }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('reset-camera'));
              useAppStore.getState().setCameraMode('orbit');
              this.setState({ hasError: false, error: null, componentStack: null });
            }}
          >
            Reset view
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
