import { Component, type ErrorInfo, type PropsWithChildren } from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React render boundary", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-screen boot-screen-error" role="alert">
          <strong>The workspace could not render</strong>
          <span>{this.state.error.message}</span>
          <button type="button" onClick={() => globalThis.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
