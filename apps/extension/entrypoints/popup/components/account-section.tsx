import { CircleAlert, LogOut, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudSessionStatus, CloudSignOutStatus } from "@/shared/messages";

export interface AccountDependencies {
  getCloudSession(): Promise<CloudSessionStatus>;
  openCloudSignIn(): Promise<void>;
  signOutCloud(): Promise<CloudSignOutStatus>;
}

/** Poll while the sign-in tab is open, then stop after this long. */
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export interface AccountSectionProps {
  deps: AccountDependencies;
  /** Test seam for the sign-in poll interval. */
  pollIntervalMs?: number;
  /** Notified on every resolved session status (popup drives the cloud toggle). */
  onSessionChange?(session: CloudSessionStatus): void;
}

type AccountState =
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "signing-in" }
  | { status: "signed-in"; email: string; displayName?: string }
  | { status: "error"; message: string };

export function AccountSection({
  deps,
  pollIntervalMs = 1500,
  onSessionChange,
}: AccountSectionProps) {
  const [state, setState] = useState<AccountState>({ status: "checking" });
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const checkSession = useCallback(async (): Promise<CloudSessionStatus> => {
    const session = await deps.getCloudSession();
    onSessionChange?.(session);
    setState(
      session.status === "signed-in"
        ? {
            status: "signed-in",
            email: session.email,
            displayName: session.displayName,
          }
        : session.status === "signed-out"
          ? { status: "signed-out" }
          : {
              status: "error",
              message: "Could not reach Transcriptly.",
            },
    );
    return session;
  }, [deps, onSessionChange]);

  useEffect(() => {
    void checkSession();
    return () => clearInterval(pollRef.current);
  }, [checkSession]);

  const handleSignIn = useCallback(async () => {
    setState({ status: "signing-in" });
    await deps.openCloudSignIn();

    clearInterval(pollRef.current);
    const startedAt = Date.now();
    pollRef.current = setInterval(() => {
      if (Date.now() - startedAt > SIGN_IN_TIMEOUT_MS) {
        clearInterval(pollRef.current);
        setState((current) =>
          current.status === "signing-in"
            ? { status: "error", message: "Sign-in did not complete." }
            : current,
        );
        return;
      }
      void deps.getCloudSession().then((session) => {
        if (session.status === "signed-in") {
          clearInterval(pollRef.current);
          onSessionChange?.(session);
          setState({
            status: "signed-in",
            email: session.email,
            displayName: session.displayName,
          });
        }
      });
    }, pollIntervalMs);
  }, [deps, pollIntervalMs, onSessionChange]);

  const handleSignOut = useCallback(async () => {
    const result = await deps.signOutCloud();
    if (result.status === "signed-out") {
      onSessionChange?.({ status: "signed-out" });
    }
    setState(
      result.status === "signed-out"
        ? { status: "signed-out" }
        : { status: "error", message: "Sign out failed. Try again." },
    );
  }, [deps, onSessionChange]);

  return (
    <section className="account" aria-label="Transcriptly account">
      {state.status === "checking" && (
        <p className="account-status" role="status">
          Checking sign-in…
        </p>
      )}

      {state.status === "signed-out" && (
        <button
          type="button"
          className="account-action"
          aria-label="Sign in to contribute publicly"
          onClick={() => void handleSignIn()}
        >
          <UserRound />
          <span>Sign in</span>
        </button>
      )}

      {state.status === "signing-in" && (
        <p className="account-status" role="status">
          Waiting for sign-in… complete it in the opened tab.
        </p>
      )}

      {state.status === "signed-in" && (
        <div className="account-signed-in">
          <span className="account-email" title={state.email}>
            {state.displayName ?? state.email}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void handleSignOut()}
          >
            <LogOut />
          </button>
        </div>
      )}

      {state.status === "error" && (
        <button
          type="button"
          className="account-action account-unavailable"
          aria-label="Try again"
          title={`${state.message} Try again.`}
          onClick={() => void checkSession()}
        >
          <CircleAlert />
          <span className="sr-only">{state.message}</span>
        </button>
      )}
    </section>
  );
}
