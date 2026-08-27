import { useCallback, useEffect, useState } from "react";
import type { CloudSessionStatus } from "@/shared/messages";
import type { PopupDependencies } from "../app";

/** The popup's Cloud identity state: sign-in, the one-time public
 *  contribution disclosure (#64), and the remembered Cloud preference
 *  (#35, #36) - which must never be applied to a signed-out popup. */
export function useCloudSession(deps: PopupDependencies) {
  const [signedIn, setSignedIn] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"unknown" | "in" | "out">(
    "unknown",
  );
  const [publicProfileConfirmed, setPublicProfileConfirmed] = useState(false);
  const [publicConfirmationAccepted, setPublicConfirmationAccepted] =
    useState(false);
  const [contributorDisplayName, setContributorDisplayName] = useState<
    string | undefined
  >();
  const [cloudEnabled, setCloudEnabled] = useState(false);

  // Apply the remembered preference only after the current session is known.
  // This avoids a race between storage and the account session check.
  useEffect(() => {
    if (sessionStatus === "unknown") return;
    let cancelled = false;
    if (sessionStatus === "out") {
      setCloudEnabled(false);
      return () => {
        cancelled = true;
      };
    }

    deps.cloud
      .getCloudPreference()
      .then((enabled) => {
        if (!cancelled) setCloudEnabled(enabled);
      })
      .catch(() => {
        // Preference stays off when it cannot be read.
      });
    return () => {
      cancelled = true;
    };
  }, [deps, sessionStatus]);

  const handleSessionChange = useCallback(
    (session: CloudSessionStatus) => {
      setSignedIn(session.status === "signed-in");
      setSessionStatus(session.status === "signed-in" ? "in" : "out");
      if (session.status !== "signed-in") {
        setPublicProfileConfirmed(false);
        setPublicConfirmationAccepted(false);
        setContributorDisplayName(undefined);
        setCloudEnabled(false);
        void deps.cloud.setCloudPreference(false).catch(() => {});
      } else {
        setPublicProfileConfirmed(session.publicContributionConfirmed === true);
        setContributorDisplayName(session.displayName);
      }
    },
    [deps],
  );

  const handleCloudToggle = useCallback(
    (enabled: boolean) => {
      setCloudEnabled(enabled);
      // Re-collapse the one-time disclosure with the destination: turning
      // Contribute publicly back on must show the text again (#64).
      if (!enabled) setPublicConfirmationAccepted(false);
      void deps.cloud.setCloudPreference(enabled).catch(() => {});
    },
    [deps],
  );

  return {
    signedIn,
    handleSessionChange,
    publicProfileConfirmed,
    setPublicProfileConfirmed,
    publicConfirmationAccepted,
    setPublicConfirmationAccepted,
    contributorDisplayName,
    cloudEnabled,
    handleCloudToggle,
  };
}

export type CloudSession = ReturnType<typeof useCloudSession>;
