import { parseVideoId } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudQueueStatus } from "@/cloud/jobs";
import {
  type AccountDependencies,
  AccountSection,
  CaptureView,
  CloudStatusPanel,
  type SaveState,
} from "@/entrypoints/popup/components";
import { errorMessage, isYouTubeWatchUrl } from "@/entrypoints/popup/utils";
import {
  type LocalMarkdownSaver,
  suggestedMarkdownFilename,
} from "@/local-save";
import type {
  CaptureResponseMessage,
  CloudJobRetryStatus,
  CloudSaveEnqueueStatus,
  CloudSessionStatus,
} from "@/shared/messages";

export interface PopupTab {
  id?: number;
  url?: string;
}

/** The popup's window into the background cloud queue (#35, #36). */
export interface CloudDependencies {
  enqueueCloudSave(capture: Capture): Promise<CloudSaveEnqueueStatus>;
  getCloudQueueStatus(videoId: string): Promise<CloudQueueStatus>;
  retryCloudJob(jobId: string): Promise<CloudJobRetryStatus>;
  /** Remembered Cloud preference, persisted per installation. */
  getCloudPreference(): Promise<boolean>;
  setCloudPreference(enabled: boolean): Promise<void>;
}

export interface PopupDependencies {
  getActiveTab(): Promise<PopupTab | undefined>;
  requestCapture(tabId: number): Promise<CaptureResponseMessage>;
  createSaver(): Promise<LocalMarkdownSaver>;
  account: AccountDependencies;
  cloud: CloudDependencies;
}

type CaptureState =
  | { status: "capturing" }
  | { status: "ready"; capture: Capture }
  | { status: "error"; message: string };

/** Poll cadence for the cloud queue status while the popup is open. */
const QUEUE_STATUS_POLL_MS = 1500;

export function Popup({ deps }: { deps: PopupDependencies }) {
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: "capturing",
  });
  const [activeVideoId, setActiveVideoId] = useState<string | undefined>();
  const [signedIn, setSignedIn] = useState(false);
  // Tracks whether the session status has resolved yet: the remembered
  // Cloud preference must never be applied to a signed-out popup (#35 AC).
  const sessionKnownRef = useRef<"unknown" | "in" | "out">("unknown");
  const [sessionStatus, setSessionStatus] = useState<"unknown" | "in" | "out">(
    "unknown",
  );
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [queueStatus, setQueueStatus] = useState<
    CloudQueueStatus | undefined
  >();
  const [cloudError, setCloudError] = useState<string | undefined>();
  const [queueStatusRefresh, setQueueStatusRefresh] = useState(0);
  const [saver, setSaver] = useState<LocalMarkdownSaver | undefined>();
  const [saverError, setSaverError] = useState<string | undefined>();
  const [directoryName, setDirectoryName] = useState<string | undefined>();
  const [filename, setFilename] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [changingFolder, setChangingFolder] = useState(false);

  const refreshQueueStatus = useCallback(() => {
    setQueueStatusRefresh((count) => count + 1);
  }, []);

  const runCapture = useCallback(async () => {
    setCaptureState({ status: "capturing" });
    setSaveState({ status: "idle" });
    try {
      const tab = await deps.getActiveTab();
      if (!tab) {
        setCaptureState({
          status: "error",
          message: "No active tab found. Open a YouTube video and try again.",
        });
        return;
      }
      if (tab.id === undefined || !isYouTubeWatchUrl(tab.url)) {
        setCaptureState({
          status: "error",
          message:
            "Transcriptly works on YouTube watch pages. Open a YouTube video and try again.",
        });
        return;
      }

      setActiveVideoId(
        tab.url ? (parseVideoId(tab.url) ?? undefined) : undefined,
      );

      const response = await deps.requestCapture(tab.id);
      if (!response.ok) {
        setCaptureState({ status: "error", message: response.message });
        return;
      }
      if (response.capture.segments.length === 0) {
        setCaptureState({
          status: "error",
          message: "No transcript found on this video.",
        });
        return;
      }

      setFilename(suggestedMarkdownFilename(response.capture));
      setCaptureState({ status: "ready", capture: response.capture });
    } catch (error) {
      setCaptureState({
        status: "error",
        message: detailIncludes(error, "Receiving end does not exist")
          ? "Could not reach the transcript capture script. Reload the YouTube page and try again."
          : `Could not capture this page: ${errorMessage(error)}`,
      });
    }
  }, [deps]);

  useEffect(() => {
    void runCapture();
  }, [runCapture]);

  useEffect(() => {
    let cancelled = false;
    deps
      .createSaver()
      .then(async (created) => {
        setSaver(created);
        const savedName = await created.getSavedDirectoryName();
        if (!cancelled) setDirectoryName(savedName);
      })
      .catch((error: unknown) => {
        if (!cancelled) setSaverError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [deps]);

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
      const nextStatus = session.status === "signed-in" ? "in" : "out";
      sessionKnownRef.current = nextStatus;
      setSessionStatus(nextStatus);
      if (session.status !== "signed-in") {
        setCloudEnabled(false);
        void deps.cloud.setCloudPreference(false).catch(() => {});
      }
    },
    [deps],
  );

  // Poll the background queueStatus for the current video so Saving / Saved /
  // Failed survive popup close and reopen (#35 AC). Bumping queueStatusRefresh
  // forces an immediate re-poll after enqueue/retry.
  useEffect(() => {
    if (!activeVideoId) return;
    void queueStatusRefresh;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await deps.cloud.getCloudQueueStatus(activeVideoId);
        if (!cancelled) setQueueStatus(next);
      } catch {
        // The background worker is unreachable; the next tick retries.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), QUEUE_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeVideoId, queueStatusRefresh, deps]);

  const handleCloudToggle = useCallback(
    (enabled: boolean) => {
      setCloudEnabled(enabled);
      void deps.cloud.setCloudPreference(enabled).catch(() => {});
    },
    [deps],
  );

  const handleRetry = useCallback(
    async (jobId: string) => {
      try {
        const result = await deps.cloud.retryCloudJob(jobId);
        if (result.ok) {
          setCloudError(undefined);
          refreshQueueStatus();
        } else {
          setCloudError(result.message);
        }
      } catch (error) {
        setCloudError(errorMessage(error));
      }
    },
    [deps, refreshQueueStatus],
  );

  const handleSave = async () => {
    if (captureState.status !== "ready") return;
    setSaveState({ status: "saving" });

    // The Cloud Job is persisted before any local saving so the upload
    // survives even if the popup closes mid-save (#35 AC).
    if (cloudEnabled && signedIn) {
      try {
        const result = await deps.cloud.enqueueCloudSave(captureState.capture);
        if (result.ok) {
          setCloudError(undefined);
          refreshQueueStatus();
        } else {
          setCloudError(result.message);
        }
      } catch (error) {
        setCloudError(errorMessage(error));
      }
    }

    if (!saver) return;
    try {
      const result = await saver.save(captureState.capture, filename);
      setFilename(result.filename);
      setDirectoryName(result.directoryName);
      setSaveState({
        status: "saved",
        directoryName: result.directoryName,
        filename: result.filename,
      });
    } catch (error) {
      setSaveState({ status: "error", message: errorMessage(error) });
    }
  };

  const handleChangeFolder = async () => {
    if (!saver) return;
    setChangingFolder(true);
    try {
      const next = await saver.changeDirectory();
      setDirectoryName(next);
    } catch (error) {
      setSaveState({ status: "error", message: errorMessage(error) });
    } finally {
      setChangingFolder(false);
    }
  };

  return (
    <div className="popup">
      <h1>Transcriptly</h1>
      <AccountSection
        deps={deps.account}
        onSessionChange={handleSessionChange}
      />
      <CloudStatusPanel
        queueStatus={queueStatus}
        cloudError={cloudError}
        signedIn={signedIn}
        onRetry={(jobId) => void handleRetry(jobId)}
      />

      {captureState.status === "capturing" && (
        <div className="capturing" role="status">
          <p>Capturing transcript…</p>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton short" />
        </div>
      )}

      {captureState.status === "error" && (
        <div className="error-banner" role="alert">
          <p>{captureState.message}</p>
          <button type="button" onClick={() => void runCapture()}>
            Try again
          </button>
        </div>
      )}

      {captureState.status === "ready" && (
        <CaptureView
          capture={captureState.capture}
          filename={filename}
          saver={saver}
          saverError={saverError}
          directoryName={directoryName}
          changingFolder={changingFolder}
          saveState={saveState}
          cloudEnabled={cloudEnabled}
          cloudAvailable={signedIn}
          onCloudToggle={handleCloudToggle}
          onFilenameChange={setFilename}
          onSave={() => void handleSave()}
          onChangeFolder={() => void handleChangeFolder()}
        />
      )}
    </div>
  );
}

function detailIncludes(error: unknown, needle: string): boolean {
  return errorMessage(error).includes(needle);
}
