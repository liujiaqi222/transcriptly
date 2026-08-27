import type { MarkdownFormat } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { CircleAlert, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
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
} from "@/entrypoints/popup/components";
import { useActiveCapture } from "@/entrypoints/popup/hooks/use-active-capture";
import { useBatchNavigation } from "@/entrypoints/popup/hooks/use-batch-navigation";
import { useBatchStatus } from "@/entrypoints/popup/hooks/use-batch-status";
import { useCloudQueue } from "@/entrypoints/popup/hooks/use-cloud-queue";
import { useCloudSession } from "@/entrypoints/popup/hooks/use-cloud-session";
import { useLocalSave } from "@/entrypoints/popup/hooks/use-local-save";
import { errorMessage } from "@/entrypoints/popup/utils";
import type { LocalMarkdownSaver } from "@/local-save";
import type {
  BatchEnterSelectionStatus,
  BatchMutationStatus,
  BatchStatusResult,
  CaptureResponseMessage,
  CloudJobRetryStatus,
  CloudSaveEnqueueStatus,
} from "@/shared/messages";

export interface PopupTab {
  id?: number;
  url?: string;
}

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

/** The popup shell: composes one hook per domain (active capture, batch
 *  navigation, batch status, cloud session, cloud queue, local save) and
 *  keeps only the cross-domain orchestration here - the save flow and the
 *  folder picker. */
export function Popup({ deps }: { deps: PopupDependencies }) {
  const capture = useActiveCapture(deps);
  const batchNav = useBatchNavigation(deps, {
    batchTabId: capture.batchTabId,
    batchTabUrl: capture.batchTabUrl,
    playlistTarget: capture.playlistTarget,
  });
  const batchStatus = useBatchStatus(deps);
  const session = useCloudSession(deps);
  const queue = useCloudQueue(deps, capture.activeVideoId);
  const localSave = useLocalSave(deps);
  // Local Markdown stays on by default but is an independent destination:
  // turning it off leaves the public contribution as the whole save (#64).
  const [localEnabled, setLocalEnabled] = useState(true);

  const { runCapture: runActiveCapture } = capture;
  const { resetErrors } = batchNav;
  const runCapture = useCallback(async () => {
    resetErrors();
    await runActiveCapture();
  }, [resetErrors, runActiveCapture]);

  const handleLocalToggle = useCallback((enabled: boolean) => {
    setLocalEnabled(enabled);
  }, []);

  const handleOpenBatchManager = useCallback(
    (taskId: string) => deps.openBatchManager(taskId),
    [deps],
  );

  const handleChangeFolder = async () => {
    const result = await localSave.changeDirectory();
    if (!result.ok) {
      capture.setSaveState({ status: "error", message: result.message });
    }
  };

  const handleSave = async () => {
    if (capture.captureState.status !== "ready") return;
    capture.setSaveState({ status: "saving" });

    // The Cloud Job is persisted before any local saving so the upload
    // survives even if the popup closes mid-save (#35 AC). The first
    // contribution carries the one-time disclosure acceptance (#64); the
    // Save button is disabled until it is accepted, so this guard only
    // covers programmatic paths.
    if (session.cloudEnabled && session.signedIn) {
      if (
        !session.publicProfileConfirmed &&
        !session.publicConfirmationAccepted
      ) {
        queue.setCloudError(
          "Confirm the public disclosure before contributing this transcript.",
        );
      } else {
        try {
          const result = await deps.cloud.enqueueCloudSave(
            capture.captureState.capture,
            session.publicProfileConfirmed
              ? undefined
              : { confirmPublicProfile: true },
          );
          if (result.ok) {
            queue.setCloudError(undefined);
            session.setPublicProfileConfirmed(true);
            session.setPublicConfirmationAccepted(false);
            queue.refreshQueueStatus();
          } else {
            queue.setCloudError(result.message);
          }
        } catch (error) {
          queue.setCloudError(errorMessage(error));
        }
      }
    }

    // Local is an independent destination (#64): when it is switched off,
    // the contribution above is the whole save and the queue status panel
    // carries the progress display - no folder picker is forced.
    if (!localEnabled || !localSave.saver) {
      capture.setSaveState({ status: "idle" });
      return;
    }
    try {
      const result = await localSave.saver.save(
        capture.captureState.capture,
        capture.filename,
        localSave.markdownFormat,
      );
      capture.setFilename(result.filename);
      localSave.setDirectoryName(result.directoryName);
      capture.setSaveState({
        status: "saved",
        directoryName: result.directoryName,
        filename: result.filename,
      });
    } catch (error) {
      capture.setSaveState({ status: "error", message: errorMessage(error) });
    }
  };

  const { captureState, batchSource, batchPage, saveState } = capture;

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
          onSessionChange={session.handleSessionChange}
        />
      </header>
      <main
        className={
          batchSource ? "popup-content batch-content" : "popup-content"
        }
      >
        <CloudStatusPanel
          queueStatus={queue.queueStatus}
          cloudError={queue.cloudError}
          signedIn={session.signedIn}
          onRetry={(jobId) => void queue.handleRetry(jobId)}
        />

        {batchStatus.activeBatchTask && (
          <BatchActivity
            task={batchStatus.activeBatchTask}
            directoryName={localSave.directoryName}
            onOpenManager={handleOpenBatchManager}
            onResume={(taskId) => {
              void deps.resumeBatch(taskId);
            }}
          />
        )}

        {capture.playlistTarget && (
          <PlaylistBatchHint
            opening={batchNav.openingPlaylist}
            error={batchNav.playlistError}
            onOpenPlaylist={() => void batchNav.openPlaylist()}
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
            saver={localSave.saver}
            saverError={localSave.saverError}
            directoryName={localSave.directoryName}
            changingFolder={localSave.changingFolder}
            folderReady={localSave.folderReady}
            enteringSelection={batchNav.enteringSelection}
            enterError={batchNav.batchError}
            markdownFormat={localSave.markdownFormat}
            onMarkdownFormatChange={localSave.handleMarkdownFormatChange}
            onEnterSelection={() => void batchNav.enterSelection()}
            onChangeFolder={() => void handleChangeFolder()}
          />
        )}

        {batchSource && batchPage === "hint" && (
          <ChannelRootHint
            opening={batchNav.openingVideos}
            error={batchNav.batchError}
            onOpenVideos={() => void batchNav.openChannelVideos()}
          />
        )}

        {captureState.status === "ready" && (
          <CaptureView
            capture={captureState.capture}
            filename={capture.filename}
            saveState={saveState}
            onFilenameChange={capture.setFilename}
          />
        )}
      </main>
      {captureState.status === "ready" && (
        <SaveFooter
          saver={localSave.saver}
          saverError={localSave.saverError}
          directoryName={localSave.directoryName}
          changingFolder={localSave.changingFolder}
          saveState={saveState}
          cloudEnabled={session.cloudEnabled}
          cloudAvailable={session.signedIn}
          publicProfileConfirmed={session.publicProfileConfirmed}
          publicConfirmationAccepted={session.publicConfirmationAccepted}
          contributorDisplayName={session.contributorDisplayName}
          markdownFormat={localSave.markdownFormat}
          onMarkdownFormatChange={localSave.handleMarkdownFormatChange}
          localEnabled={localEnabled}
          onLocalToggle={handleLocalToggle}
          onCloudToggle={session.handleCloudToggle}
          onPublicConfirmationChange={session.setPublicConfirmationAccepted}
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
