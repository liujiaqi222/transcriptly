import { Component, type ReactNode } from "react";
import { LogoMark } from "@/brand/logo-mark";
import { reportExtensionError } from "@/shared/sentry-client";

interface ExtensionErrorBoundaryProps {
  /** Surface name attached to Sentry context. */
  surface: "popup" | "manager";
  children: ReactNode;
  /** Overridable for tests. */
  onError?: (error: unknown, surface: string) => void;
}

interface ExtensionErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort React error boundary for the popup and manager pages: it
 * keeps a render crash from leaving a blank white page, shows a recovery
 * UI, and reports the crash to Sentry (the SDK is already initialized in
 * these entrypoints before render, so reporting is active here).
 */
export class ExtensionErrorBoundary extends Component<
  ExtensionErrorBoundaryProps,
  ExtensionErrorBoundaryState
> {
  override state: ExtensionErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ExtensionErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown): void {
    const report =
      this.props.onError ??
      ((err: unknown, surface: string) =>
        reportExtensionError(err, { surface }));
    report(error, this.props.surface);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-brand">
            <LogoMark size={24} />
          </div>
          <h2>Something went wrong</h2>
          <p>
            The {this.props.surface} hit an unexpected error. Your saved
            transcripts and preferences are not affected.
          </p>
          <div className="error-boundary-actions">
            <button type="button" onClick={() => location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="error-boundary-secondary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
