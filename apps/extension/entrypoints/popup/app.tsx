import { type MarkdownFormat, parseVideoId } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchTask } from "@/batch/jobs";
import { LogoMark } from "@/brand/logo-mark";
import type { CloudQueueStatus } from "@/cloud/jobs";
import {
  type AccountDependencies,
  AccountSection,
  BatchActivity,
  BatchSourceView,
  CaptureView,
  ChannelRootHint,
  CloudStatusPanel,
  PlaylistBatchHint,
  SaveFooter,
  type SaveState,
} from "@/entrypoints/popup/components";
import {
  channelVideosUrl,
  errorMessage,
  isBatchSourceUrl,
  isChannelRootUrl,
  isYouTubeWatchUrl,
  watchPlaylistUrl,
} from "@/entrypoints/popup/utils";
import {
  type LocalMarkdownSaver,
  suggestedMarkdownFilename,
} from "@/local-save";
import type {
  BatchEnterSelectionStatus,
  BatchMutationStatus,
  BatchStatusResult,
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
  enqueueCloudSave(
    capture: Capture,
    options?: { confirmPublicProfile?: boolean },
  ): Promise<CloudSaveEnqueueStatus>;
  getCloudQueueStatus(videoId: string): Promise<CloudQueueStatus>;
  retryCloudJob(jobId: string): Promise<CloudJobRetryStatus>;
  /** Remembered Cloud preference, persisted per installation. */
  getCloudPreference(): Promise<boolean>;
  setCloudPreference(enabled: boolean): Promise<void>;
}

export interface PopupDependencies {
  getActiveTab(): Promise<PopupTab | undefined>;
  requestCapture(tabId: number): Promise<CaptureResponseMessage>;
  /** Ask the tab's content script to enter selection mode (#56). */
  enterBatchSelection(tabId: number): Promise<BatchEnterSelectionStatus>;
  /** Navigate a tab to another YouTube page (channel Videos tab #56,
   *  playlist page #69) so a batch source becomes selectable. */
  navigateTab(tabId: number, url: string): Promise<void>;
  /** Recent batch tasks from the background worker (#58). */
  getBatchStatus(): Promise<BatchStatusResult>;
  /** Open the batch manager page on a task (#58, routed via the worker #59). */
  openBatchManager(taskId: string): void;
  /** Continue a paused batch (#59). */
  resumeBatch(taskId: string): Promise<BatchMutationStatus>;
  /** Close the popup window once selection mode is on. */
  closePopup(): void;
  createSaver(): Promise<LocalMarkdownSaver>;
  markdown: {
    getPreference(): Promise<MarkdownFormat>;
    setPreference(format: MarkdownFormat): Promise<void>;
  };
  account: AccountDependencies;
  cloud: CloudDependencies;
  /** Open the built-in AI Playground page in a new tab (#78). */
  openAiPlayground(): void;
}

type CaptureState =
  | { status: "capturing" }
  | { status: "ready"; capture: Capture }
  | { status: "error"; message: string };
/** Poll cadence for the cloud queue status while the popup is open. */
const QUEUE_STATUS_POLL_MS = 1500;
/** Poll cadence for the active batch task while the popup is open (#58). */
const BATCH_STATUS_POLL_MS = 2000;

export function Popup({ deps }: { deps: PopupDependencies }) {
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: "capturing",
  });
  const [activeVideoId, setActiveVideoId] = useState<string | undefined>();
  const [signedIn, setSignedIn] = useState(false);
  const [publicProfileConfirmed, setPublicProfileConfirmed] = useState(false);
  const [publicConfirmationAccepted, setPublicConfirmationAccepted] =
    useState(false);
  const [contributorDisplayName, setContributorDisplayName] = useState<
    string | undefined
  >();
  // Tracks whether the session status has resolved yet: the remembered
  // Cloud preference must never be applied to a signed-out popup (#35 AC).
  const sessionKnownRef = useRef<"unknown" | "in" | "out">("unknown");
  const [sessionStatus, setSessionStatus] = useState<"unknown" | "in" | "out">(
    "unknown",
  );
  const [cloudEnabled, setCloudEnabled] = useState(false);
  // Local Markdown stays on by default but is an independent destination:
  // turning it off leaves the public contribution as the whole save (#64).
  const [localEnabled, setLocalEnabled] = useState(true);
  const [markdownFormat, setMarkdownFormat] =
    useState<MarkdownFormat>("timeline");
  const [queueStatus, setQueueStatus] = useState<
    CloudQueueStatus | undefined
  >();
  const [cloudError, setCloudError] = useState<string | undefined>();
  const [queueStatusRefresh, setQueueStatusRefresh] = useState(0);
  const [saver, setSaver] = useState<LocalMarkdownSaver | undefined>();
  const [saverError, setSaverError] = useState<string | undefined>();
  const [directoryName, setDirectoryName] = useState<string | undefined>();
  const [folderReady, setFolderReady] = useState<boolean | undefined>();
  const [batchSource, setBatchSource] = useState(false);
  /** Batch-source page state: on-demand selection (#56). */
  const [batchPage, setBatchPage] = useState<
    "selection" | "hint" | undefined
  >();
  const [batchTabId, setBatchTabId] = useState<number | undefined>();
  const [batchTabUrl, setBatchTabUrl] = useState<string | undefined>();
  const [enteringSelection, setEnteringSelection] = useState(false);
  const [openingVideos, setOpeningVideos] = useState(false);
  const [batchError, setBatchError] = useState<string | undefined>();
  /** Playlist-page jump target on a watch page inside a playlist (#69). */
  const [playlistTarget, setPlaylistTarget] = useState<
    { tabId: number; url: string } | undefined
  >();
  const [openingPlaylist, setOpeningPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | undefined>();
  /** Newest running or paused batch, for the manager-page entry (#58). */
  const [activeBatchTask, setActiveBatchTask] = useState<
    BatchTask | undefined
  >();
  const [filename, setFilename] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [changingFolder, setChangingFolder] = useState(false);

  const refreshQueueStatus = useCallback(() => {
    setQueueStatusRefresh((count) => count + 1);
  }, []);

  const runCapture = useCallback(async () => {
    setCaptureState({ status: "capturing" });
    setSaveState({ status: "idle" });
    setBatchSource(false);
    setBatchPage(undefined);
    setBatchTabUrl(undefined);
    setBatchError(undefined);
    setPlaylistTarget(undefined);
    setPlaylistError(undefined);
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
        if (tab.id !== undefined && isBatchSourceUrl(tab.url)) {
          // Batch pages keep the folder picker available (#26): it is the
          // only place the user can re-grant folder access for the worker.
          // Selection itself is injected on demand from here (#56); the
          // channel root only hints at its Videos tab.
          setBatchTabId(tab.id);
          setBatchTabUrl(tab.url);
          setBatchPage(isChannelRootUrl(tab.url) ? "hint" : "selection");
          setBatchSource(true);
          setCaptureState({ status: "capturing" });
          return;
        }
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

      // A watch page playing inside a playlist (#69): remember the pure
      // playlist page so the hint strip can offer the batch jump. Capture
      // continues regardless - single-video saving still works here.
      const playlistPage = watchPlaylistUrl(tab.url);
      if (playlistPage) {
        setPlaylistTarget({ tabId: tab.id, url: playlistPage });
      }

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
    deps.markdown
      .getPreference()
      .then((format) => {
        if (!cancelled) setMarkdownFormat(format);
      })
      .catch(() => {
        // Timeline is the safe, backward-compatible default.
      });
    return () => {
      cancelled = true;
    };
  }, [deps]);

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

  // Track whether the background worker can write without a prompt, so the
  // batch-source view can ask for a re-grant when Chrome dropped access.
  useEffect(() => {
    let cancelled = false;
    if (!saver || !directoryName) {
      setFolderReady(undefined);
      return;
    }
    saver
      .hasWritePermission()
      .then((ready) => {
        if (!cancelled) setFolderReady(ready);
      })
      .catch(() => {
        if (!cancelled) setFolderReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saver, directoryName]);

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

  const handleLocalToggle = useCallback((enabled: boolean) => {
    setLocalEnabled(enabled);
  }, []);

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

  const handleMarkdownFormatChange = useCallback(
    (format: MarkdownFormat) => {
      setMarkdownFormat(format);
      void deps.markdown.setPreference(format).catch(() => {});
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

  const handleEnterSelection = useCallback(async () => {
    if (batchTabId === undefined) return;
    setEnteringSelection(true);
    try {
      const result = await deps.enterBatchSelection(batchTabId);
      if (result.ok) {
        // Selection mode is on: get out of the way so the checkboxes are
        // visible immediately.
        deps.closePopup();
        return;
      }
      setBatchError(result.message);
    } catch (error) {
      setBatchError(
        detailIncludes(error, "Receiving end does not exist")
          ? "Could not reach the page. Reload the YouTube page and try again."
          : errorMessage(error),
      );
    } finally {
      setEnteringSelection(false);
    }
  }, [batchTabId, deps]);

  // Poll the background worker for an active batch so the manager entry
  // stays reachable after the YouTube source page is closed (#58 AC).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await deps.getBatchStatus();
        if (cancelled) return;
        // Tasks arrive newest-first (the status router sorts them).
        setActiveBatchTask(
          result.tasks.find(
            (task) =>
              task.state === "queued" ||
              task.state === "running" ||
              task.state === "paused",
          ),
        );
      } catch {
        // The background worker is unreachable; the next tick retries.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), BATCH_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [deps]);

  const handleOpenBatchManager = useCallback(
    (taskId: string) => deps.openBatchManager(taskId),
    [deps],
  );

  const handleOpenChannelVideos = async () => {
    const videosUrl = batchTabUrl ? channelVideosUrl(batchTabUrl) : undefined;
    if (batchTabId === undefined || !videosUrl) {
      setBatchError("Could not find this channel's Videos tab.");
      return;
    }
    setOpeningVideos(true);
    setBatchError(undefined);
    try {
      await deps.navigateTab(batchTabId, videosUrl);
      deps.closePopup();
    } catch (error) {
      setBatchError(`Could not open the Videos tab: ${errorMessage(error)}`);
      setOpeningVideos(false);
    }
  };

  // Same-tab jump as the channel-root Videos hint (#69): the popup closes
  // after navigating because its capture state belongs to the old page.
  const handleOpenPlaylist = async () => {
    if (!playlistTarget) return;
    setOpeningPlaylist(true);
    setPlaylistError(undefined);
    try {
      await deps.navigateTab(playlistTarget.tabId, playlistTarget.url);
      deps.closePopup();
    } catch (error) {
      setPlaylistError(`Could not open the playlist: ${errorMessage(error)}`);
      setOpeningPlaylist(false);
    }
  };

  const handleSave = async () => {
    if (captureState.status !== "ready") return;
    setSaveState({ status: "saving" });

    // The Cloud Job is persisted before any local saving so the upload
    // survives even if the popup closes mid-save (#35 AC). The first
    // contribution carries the one-time disclosure acceptance (#64); the
    // Save button is disabled until it is accepted, so this guard only
    // covers programmatic paths.
    if (cloudEnabled && signedIn) {
      if (!publicProfileConfirmed && !publicConfirmationAccepted) {
        setCloudError(
          "Confirm the public disclosure before contributing this transcript.",
        );
      } else {
        try {
          const result = await deps.cloud.enqueueCloudSave(
            captureState.capture,
            publicProfileConfirmed ? undefined : { confirmPublicProfile: true },
          );
          if (result.ok) {
            setCloudError(undefined);
            setPublicProfileConfirmed(true);
            setPublicConfirmationAccepted(false);
            refreshQueueStatus();
          } else {
            setCloudError(result.message);
          }
        } catch (error) {
          setCloudError(errorMessage(error));
        }
      }
    }

    // Local is an independent destination (#64): when it is switched off,
    // the contribution above is the whole save and the queue status panel
    // carries the progress display - no folder picker is forced.
    if (!localEnabled || !saver) {
      setSaveState({ status: "idle" });
      return;
    }
    try {
      const result = await saver.save(
        captureState.capture,
        filename,
        markdownFormat,
      );
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
      <header className="popup-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <LogoMark size={28} />
          </span>
          <span>
            <h1>Transcriptly</h1>
          </span>
        </div>
        <AccountSection
          deps={deps.account}
          onSessionChange={handleSessionChange}
        />
      </header>
      <main
        className={
          batchSource ? "popup-content batch-content" : "popup-content"
        }
      >
        <CloudStatusPanel
          queueStatus={queueStatus}
          cloudError={cloudError}
          signedIn={signedIn}
          onRetry={(jobId) => void handleRetry(jobId)}
        />

        {activeBatchTask && (
          <BatchActivity
            task={activeBatchTask}
            directoryName={directoryName}
            onOpenManager={handleOpenBatchManager}
            onResume={(taskId) => {
              void deps.resumeBatch(taskId);
            }}
          />
        )}

        {playlistTarget && (
          <PlaylistBatchHint
            opening={openingPlaylist}
            error={playlistError}
            onOpenPlaylist={() => void handleOpenPlaylist()}
          />
        )}

        {!batchSource && captureState.status === "capturing" && (
          <div className="capturing" role="status">
            <div className="capturing-title">
              <RefreshCw />
              <p>Capturing transcript…</p>
            </div>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton short" />
          </div>
        )}

        {captureState.status === "error" && (
          <section className="empty-state" role="alert">
            <div className="state-icon">
              <CircleAlert />
            </div>
            <h2>Open a YouTube video</h2>
            <p className="state-copy">{captureState.message}</p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void runCapture()}
            >
              <RefreshCw />
              Try again
            </button>
          </section>
        )}

        {batchSource && batchPage === "selection" && (
          <BatchSourceView
            saver={saver}
            saverError={saverError}
            directoryName={directoryName}
            changingFolder={changingFolder}
            folderReady={folderReady}
            enteringSelection={enteringSelection}
            enterError={batchError}
            markdownFormat={markdownFormat}
            onMarkdownFormatChange={handleMarkdownFormatChange}
            onEnterSelection={() => void handleEnterSelection()}
            onChangeFolder={() => void handleChangeFolder()}
          />
        )}

        {batchSource && batchPage === "hint" && (
          <ChannelRootHint
            opening={openingVideos}
            error={batchError}
            onOpenVideos={() => void handleOpenChannelVideos()}
          />
        )}

        {captureState.status === "ready" && (
          <CaptureView
            capture={captureState.capture}
            filename={filename}
            saveState={saveState}
            onFilenameChange={setFilename}
          />
        )}
      </main>
      {captureState.status === "ready" && (
        <SaveFooter
          saver={saver}
          saverError={saverError}
          directoryName={directoryName}
          changingFolder={changingFolder}
          saveState={saveState}
          cloudEnabled={cloudEnabled}
          cloudAvailable={signedIn}
          publicProfileConfirmed={publicProfileConfirmed}
          publicConfirmationAccepted={publicConfirmationAccepted}
          contributorDisplayName={contributorDisplayName}
          markdownFormat={markdownFormat}
          onMarkdownFormatChange={handleMarkdownFormatChange}
          localEnabled={localEnabled}
          onLocalToggle={handleLocalToggle}
          onCloudToggle={handleCloudToggle}
          onPublicConfirmationChange={setPublicConfirmationAccepted}
          onSave={() => void handleSave()}
          onChangeFolder={() => void handleChangeFolder()}
        />
      )}
      <footer className="playground-entry">
        <button type="button" onClick={deps.openAiPlayground}>
          <Sparkles />
          AI Playground
        </button>
      </footer>
    </div>
  );
}

function detailIncludes(error: unknown, needle: string): boolean {
  return errorMessage(error).includes(needle);
}
