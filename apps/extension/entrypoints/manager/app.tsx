import type { MarkdownFormat } from "@transcriptly/capture";
import {
  FileText,
  FolderOpen,
  Globe2,
  LibraryBig,
  LogIn,
  Pause,
  Play,
  RotateCw,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { BatchDraft } from "@/batch/drafts";
import {
  doneItemCount,
  estimateRemainingSeconds,
  failedItemCount,
  formatDuration,
  isFinishingCurrentVideo,
} from "@/batch/eta";
import type { BatchDestination, BatchItem, BatchTask } from "@/batch/jobs";
import { LogoMark } from "@/brand/logo-mark";
import type {
  ManagerLocalSaveHost,
  ManagerLocalSaveHostStatus,
} from "@/entrypoints/manager/local-save-host";
import type { SavePreferences } from "@/save-preferences";
import {
  BATCH_DRAFT_DELETE,
  BATCH_DRAFT_REQUEST,
  BATCH_PAUSE,
  BATCH_RESUME,
  BATCH_RETRY_ITEM,
  BATCH_START,
  BATCH_STATUS_REQUEST,
  BATCH_STOP,
  type BatchDraftResult,
  type BatchMutationStatus,
  type BatchStartStatus,
  type BatchStatusResult,
  CLOUD_SESSION_REQUEST,
  type CloudSessionStatus,
} from "@/shared/messages";

/**
 * The batch manager page (#58, #59, #102): everything the 300 px page overlay
 * used to show now lives here - total progress with a sliding ETA,
 * per-video Local / Cloud results with failure reasons and Retry, Pause /
 * Stop / Resume, and the recent-batches history. `?task=<id>` deep-links
 * to one batch; without it the newest batch is shown. State is polled
 * from the background worker, so the page survives closing the YouTube
 * source page and can be re-opened from the popup or the floating
 * capsule.
 *
 * Since #102 the page also owns pre-start destination and format setup.
 * Since #59 it hosts the
 * Local Save Host (folder authorization and Markdown writes), so a
 * paused batch shows the exact reason and its matching action -
 * Continue after a browser restart, Grant folder access & continue for
 * an expired local grant, or a reopen hint when the save host was lost.
 * The reason comes from the persisted `pauseReason`, never guessed from
 * error text.
 */

export interface ManagerDependencies {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
  openCloudSignIn(): Promise<void>;
  preferences: SavePreferences;
}

const STATUS_POLL_MS = 1000;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const NO_LOCAL_HOST: ManagerLocalSaveHostStatus = { writePermission: false };

const STATE_LABELS: Record<BatchTask["state"], string> = {
  queued: "Running",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

/**
 * A pause takes effect between videos: while the current one is still
 * finishing, the chip says so instead of claiming an instant "Paused".
 */
function stateLabel(task: BatchTask): string {
  return isFinishingCurrentVideo(task)
    ? "Pausing - finishing current video"
    : STATE_LABELS[task.state];
}

const RETRYABLE_STATES = ["failed", "skipped", "cancelled"];

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function itemState(
  item: BatchItem,
  destination: BatchDestination,
): BatchItem["local"] {
  return destination === "local" ? item.local : item.cloud;
}

function destinationLabel(destination: BatchDestination): string {
  return destination === "cloud" ? "public" : "local";
}

function isRetryable(task: BatchTask, item: BatchItem): boolean {
  return task.destinations.some((destination) =>
    RETRYABLE_STATES.includes(itemState(item, destination)),
  );
}

interface BatchTaskDetailProps {
  task: BatchTask;
  mutationError?: string;
  localSaveHost?: ManagerLocalSaveHost;
  onMutate(message: unknown): void;
}

/**
 * Why the batch paused, straight from the persisted `pauseReason` (#59),
 * with the matching action. Never guessed from error text.
 */
function PauseNotice({
  task,
  localSaveHost,
  onMutate,
}: {
  task: BatchTask;
  localSaveHost?: ManagerLocalSaveHost;
  onMutate(message: unknown): void;
}) {
  const reason = task.pauseReason;
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | undefined>();
  const subscribe = useCallback(
    (onChange: () => void) => localSaveHost?.subscribe(onChange) ?? (() => {}),
    [localSaveHost],
  );
  const getSnapshot = useCallback(
    () => localSaveHost?.getStatus() ?? NO_LOCAL_HOST,
    [localSaveHost],
  );
  const hostStatus = useSyncExternalStore(subscribe, getSnapshot);
  if (task.state !== "paused" || !reason || reason === "user") return null;

  const resume = () => onMutate({ type: BATCH_RESUME, taskId: task.id });

  let text: string;
  let action: ReactNode;
  if (reason === "browser-restart") {
    text =
      "The browser restarted while this batch was running. Continue where it left off?";
    action = (
      <button type="button" onClick={resume}>
        <Play />
        Continue
      </button>
    );
  } else if (reason === "local-permission") {
    const hasFolder = Boolean(hostStatus.directoryName);
    text = hasFolder
      ? `Transcriptly needs write access to the folder "${hostStatus.directoryName}" to continue saving locally.`
      : "Transcriptly needs a save folder to continue saving locally.";
    action = (
      <button
        type="button"
        disabled={granting || !localSaveHost}
        onClick={() => {
          if (!localSaveHost) return;
          setGranting(true);
          setGrantError(undefined);
          void localSaveHost
            .grantAccess()
            .then((outcome) => {
              if (outcome === "granted") resume();
              else if (outcome === "denied")
                setGrantError("Folder access was not granted.");
              else setGrantError("No folder was selected.");
            })
            .catch((error: unknown) =>
              setGrantError(
                error instanceof Error ? error.message : String(error),
              ),
            )
            .finally(() => setGranting(false));
        }}
      >
        <FolderOpen />
        {granting
          ? "Waiting for Chrome…"
          : hasFolder
            ? "Grant folder access & continue"
            : "Choose folder & continue"}
      </button>
    );
  } else {
    text =
      "The manager page lost contact with the local save host. Reopen or refresh this page, check the target folder for a possibly written file, then continue.";
    action = (
      <button type="button" onClick={resume}>
        <Play />
        Resume
      </button>
    );
  }

  return (
    <div className="pause-notice" role="status">
      <p>{text}</p>
      {action}
      {grantError && (
        <p className="error-banner" role="alert">
          {grantError}
        </p>
      )}
    </div>
  );
}

function BatchTaskDetail({
  task,
  mutationError,
  localSaveHost,
  onMutate,
}: BatchTaskDetailProps) {
  const total = task.items.length;
  const done = doneItemCount(task);
  const failed = failedItemCount(task);
  const etaSeconds = estimateRemainingSeconds(task);
  const active =
    task.state === "running" ||
    task.state === "queued" ||
    task.state === "paused";

  const summary = [
    `${done}/${total} done`,
    ...(failed > 0 ? [`${failed} failed`] : []),
    ...(etaSeconds !== undefined
      ? [`~${formatDuration(etaSeconds)} remaining`]
      : []),
  ].join(" · ");

  const items = task.items.map((item) => {
    const chips = task.destinations.map((destination) => {
      const state = itemState(item, destination);
      return (
        <span key={destination} className={`chip chip-${state}`}>
          {`${destinationLabel(destination)}: ${state}`}
        </span>
      );
    });
    const errors = task.destinations.map((destination) => {
      const error = destination === "local" ? item.localError : item.cloudError;
      return error ? (
        <p key={destination} className="item-error">
          {`${destinationLabel(destination)}: ${error}`}
        </p>
      ) : null;
    });
    return (
      <li key={item.video.videoId} className="item">
        <div className="item-head">
          <a
            className="item-title"
            href={item.video.url}
            target="_blank"
            rel="noreferrer"
            title={item.video.title}
          >
            {item.video.title}
          </a>
          <span className="item-video-id">{item.video.videoId}</span>
        </div>
        <div className="chips">{chips}</div>
        {errors}
        {isRetryable(task, item) && (
          <button
            type="button"
            className="retry"
            onClick={() =>
              onMutate({
                type: BATCH_RETRY_ITEM,
                taskId: task.id,
                videoId: item.video.videoId,
              })
            }
          >
            <RotateCw />
            Retry
          </button>
        )}
      </li>
    );
  });

  return (
    <section className="task-detail">
      <div className="task-head">
        <span className={`state state-${task.state}`}>{stateLabel(task)}</span>
        <span className="task-date">{formatTimestamp(task.createdAt)}</span>
        <span className="task-destinations">
          {task.destinations.map(destinationLabel).join(" + ")}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done} of ${total} videos done`}
      >
        <div
          className="progress-fill"
          style={{
            width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%`,
          }}
        />
      </div>
      <p className="summary">{summary}</p>
      {isFinishingCurrentVideo(task) && (
        <p className="muted" role="status">
          Pausing - the current video finishes first. It is safe to resume
          before it ends.
        </p>
      )}
      <PauseNotice
        task={task}
        localSaveHost={localSaveHost}
        onMutate={onMutate}
      />
      {active && (
        <div className="controls">
          {(task.state === "running" || task.state === "queued") && (
            <button
              type="button"
              onClick={() => onMutate({ type: BATCH_PAUSE, taskId: task.id })}
            >
              <Pause />
              Pause
            </button>
          )}
          {task.state === "paused" &&
            (!task.pauseReason || task.pauseReason === "user") && (
              <button
                type="button"
                className="cta"
                onClick={() =>
                  onMutate({ type: BATCH_RESUME, taskId: task.id })
                }
              >
                <Play />
                Resume
              </button>
            )}
          <button
            type="button"
            className="danger"
            onClick={() => onMutate({ type: BATCH_STOP, taskId: task.id })}
          >
            <X />
            Stop pending items
          </button>
        </div>
      )}
      {mutationError && (
        <p className="error-banner" role="alert">
          {mutationError}
        </p>
      )}
      <p className="hint">
        Keep the browser window in the foreground while a batch runs - each
        video opens in a foreground tab while its transcript is captured, then
        closes automatically.
      </p>
      <ul className="items">{items}</ul>
    </section>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function BatchSetup({
  draftId,
  deps,
  localSaveHost,
  onStarted,
  onCancel,
}: {
  draftId: string;
  deps: ManagerDependencies;
  localSaveHost?: ManagerLocalSaveHost;
  onStarted(taskId: string): void;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState<BatchDraft>();
  const [loadError, setLoadError] = useState<string>();
  const [localEnabled, setLocalEnabled] = useState(true);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudSession, setCloudSession] = useState<CloudSessionStatus>();
  const [signingIn, setSigningIn] = useState(false);
  const [publicConfirmationAccepted, setPublicConfirmationAccepted] =
    useState(false);
  const [markdownFormat, setMarkdownFormat] =
    useState<MarkdownFormat>("timeline");
  const [granting, setGranting] = useState(false);
  const [changingFolder, setChangingFolder] = useState(false);
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const subscribe = useCallback(
    (onChange: () => void) => localSaveHost?.subscribe(onChange) ?? (() => {}),
    [localSaveHost],
  );
  const getSnapshot = useCallback(
    () => localSaveHost?.getStatus() ?? NO_LOCAL_HOST,
    [localSaveHost],
  );
  const hostStatus = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      deps.sendMessage<BatchDraftResult>({
        type: BATCH_DRAFT_REQUEST,
        draftId,
      }),
      deps
        .sendMessage<CloudSessionStatus>({ type: CLOUD_SESSION_REQUEST })
        .catch(() => ({ status: "signed-out" }) as const),
      localSaveHost?.checkAccess().catch(() => NO_LOCAL_HOST),
      deps.preferences.getMarkdownFormat().catch(() => "timeline" as const),
      deps.preferences.getPublicContributionEnabled().catch(() => false),
    ])
      .then(
        ([
          draftResult,
          session,
          _hostStatus,
          savedMarkdownFormat,
          savedPublicEnabled,
        ]) => {
          if (cancelled) return;
          if (draftResult.ok) setDraft(draftResult.draft);
          else setLoadError(draftResult.message);
          setCloudSession(session);
          setMarkdownFormat(savedMarkdownFormat);
          setCloudEnabled(session.status === "signed-in" && savedPublicEnabled);
        },
      )
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [deps, draftId, localSaveHost]);

  useEffect(() => {
    if (!signingIn) return;
    let cancelled = false;
    const startedAt = Date.now();
    const check = () => {
      if (Date.now() - startedAt > SIGN_IN_TIMEOUT_MS) {
        setSigningIn(false);
        setSetupError(
          "Sign-in did not complete. Try again when you are ready.",
        );
        return;
      }
      void deps
        .sendMessage<CloudSessionStatus>({ type: CLOUD_SESSION_REQUEST })
        .then((session) => {
          if (cancelled) return;
          setCloudSession(session);
          if (session.status === "signed-in") {
            setSigningIn(false);
            void deps.preferences
              .getPublicContributionEnabled()
              .then((enabled) => {
                if (!cancelled) setCloudEnabled(enabled);
              })
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deps, signingIn]);

  const destinations: BatchDestination[] = [
    ...(localEnabled ? (["local"] as const) : []),
    ...(cloudEnabled ? (["cloud"] as const) : []),
  ];
  const localReady = !localEnabled || hostStatus.writePermission;
  const publicReady =
    !cloudEnabled ||
    (cloudSession?.status === "signed-in" &&
      (cloudSession.publicContributionConfirmed === true ||
        publicConfirmationAccepted));
  const canStart =
    Boolean(draft) &&
    destinations.length > 0 &&
    localReady &&
    publicReady &&
    !starting;

  const chooseFolder = () => {
    if (!localSaveHost) return;
    setChangingFolder(true);
    setSetupError(undefined);
    void localSaveHost
      .changeDirectory()
      .then((result) => {
        if (result === "cancelled") return;
      })
      .catch((error: unknown) => setSetupError(errorText(error)))
      .finally(() => setChangingFolder(false));
  };

  if (loadError) {
    return (
      <p className="error-banner" role="alert">
        {loadError}
      </p>
    );
  }
  if (!draft) {
    return (
      <p className="muted loading" role="status">
        Loading batch setup…
      </p>
    );
  }

  return (
    <section className="batch-setup">
      <div className="setup-heading">
        <span className="setup-eyebrow">New batch</span>
        <h2>{`${draft.videos.length} ${
          draft.videos.length === 1 ? "video" : "videos"
        } selected`}</h2>
      </div>

      <div className="setup-form">
        <fieldset className="setup-section">
          <legend className="sr-only">Save to</legend>
          <div className="setup-section-title" aria-hidden="true">
            Save to
          </div>
          <label className="setup-option destination-option">
            <FileText aria-hidden="true" />
            <span className="setup-option-copy">
              <strong>Local Markdown</strong>
              <small>One file per video</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Local Markdown"
              aria-checked={localEnabled}
              checked={localEnabled}
              onChange={(event) => setLocalEnabled(event.target.checked)}
            />
          </label>
          <div className="setup-option destination-option public-option">
            <Globe2 aria-hidden="true" />
            <span className="setup-option-copy">
              <strong>Public archive</strong>
              <small>Share a copy on Transcriptly</small>
            </span>
            {cloudSession?.status === "signed-in" ? (
              <input
                type="checkbox"
                role="switch"
                aria-label="Contribute publicly"
                aria-checked={cloudEnabled}
                checked={cloudEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setCloudEnabled(enabled);
                  if (!enabled) setPublicConfirmationAccepted(false);
                  void deps.preferences
                    .setPublicContributionEnabled(enabled)
                    .catch(() => undefined);
                }}
              />
            ) : (
              <button
                type="button"
                className="sign-in-button"
                aria-label="Sign in to contribute publicly"
                disabled={signingIn || !cloudSession}
                onClick={() => {
                  setSetupError(undefined);
                  setSigningIn(true);
                  void deps.openCloudSignIn().catch((error: unknown) => {
                    setSigningIn(false);
                    setSetupError(errorText(error));
                  });
                }}
              >
                <LogIn />
                {!cloudSession
                  ? "Checking…"
                  : signingIn
                    ? "Waiting…"
                    : cloudSession.status === "unavailable"
                      ? "Try again"
                      : "Sign in"}
              </button>
            )}
          </div>
          {cloudEnabled &&
            cloudSession?.status === "signed-in" &&
            !cloudSession.publicContributionConfirmed && (
              <div className="public-confirmation">
                <p>
                  Before your first contribution: these transcripts, your
                  display name, and optional avatar will be public. Your email
                  is never shown.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={publicConfirmationAccepted}
                    onChange={(event) =>
                      setPublicConfirmationAccepted(event.target.checked)
                    }
                  />
                  <span>I understand these contributions will be public</span>
                </label>
              </div>
            )}
        </fieldset>

        {localEnabled && (
          <div className="setup-section">
            <h3>Local files</h3>
            <div className="folder-status">
              <FolderOpen aria-hidden="true" />
              <span className="folder-copy">
                <small>Folder</small>
                <strong>
                  {hostStatus.directoryName ?? "No folder selected"}
                </strong>
                <small>
                  {hostStatus.writePermission
                    ? "Folder access is ready."
                    : hostStatus.directoryName
                      ? "Folder access is required before starting."
                      : "Choose where Transcriptly should save the files."}
                </small>
              </span>
              <span className="folder-actions">
                {!hostStatus.writePermission && (
                  <button
                    type="button"
                    disabled={granting || !localSaveHost}
                    onClick={() => {
                      if (!localSaveHost) return;
                      setGranting(true);
                      setSetupError(undefined);
                      void localSaveHost
                        .grantAccess()
                        .then((result) => {
                          if (result === "denied")
                            setSetupError(
                              "Folder access was not granted. You can try again or choose another folder.",
                            );
                        })
                        .catch((error: unknown) =>
                          setSetupError(errorText(error)),
                        )
                        .finally(() => setGranting(false));
                    }}
                  >
                    <FolderOpen />
                    {granting
                      ? "Waiting for Chrome…"
                      : hostStatus.directoryName
                        ? "Grant access"
                        : "Choose folder"}
                  </button>
                )}
                {hostStatus.directoryName && (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={changingFolder || !localSaveHost}
                    onClick={chooseFolder}
                  >
                    {changingFolder ? "Changing…" : "Change"}
                  </button>
                )}
              </span>
            </div>
            <div className="format-row">
              <span>
                <strong>Markdown format</strong>
                <small>Applied to every local file in this batch.</small>
              </span>
              <fieldset className="format-picker" aria-label="Local format">
                {(["timeline", "article"] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    className={markdownFormat === format ? "is-selected" : ""}
                    aria-pressed={markdownFormat === format}
                    onClick={() => {
                      setMarkdownFormat(format);
                      void deps.preferences
                        .setMarkdownFormat(format)
                        .catch(() => undefined);
                    }}
                  >
                    {format === "timeline" ? "Timeline" : "Article"}
                  </button>
                ))}
              </fieldset>
            </div>
          </div>
        )}

        {setupError && (
          <p className="error-banner" role="alert">
            {setupError}
          </p>
        )}
        <div className="setup-actions">
          <button
            type="button"
            className="start-batch"
            disabled={!canStart}
            onClick={() => {
              if (!canStart) return;
              setStarting(true);
              setSetupError(undefined);
              void deps
                .sendMessage<BatchStartStatus>({
                  type: BATCH_START,
                  draftId,
                  videos: draft.videos,
                  destinations,
                  markdownFormat,
                  ...(cloudEnabled &&
                  cloudSession?.status === "signed-in" &&
                  !cloudSession.publicContributionConfirmed &&
                  publicConfirmationAccepted
                    ? { confirmPublicProfile: true }
                    : {}),
                })
                .then((result) => {
                  if (result.ok) onStarted(result.taskId);
                  else setSetupError(result.message);
                })
                .catch((error: unknown) => setSetupError(errorText(error)))
                .finally(() => setStarting(false));
            }}
          >
            <Play />
            {starting ? "Starting batch…" : "Start batch"}
          </button>
          <button
            type="button"
            className="cancel-setup"
            disabled={starting}
            onClick={() => {
              setSetupError(undefined);
              void deps
                .sendMessage<BatchMutationStatus>({
                  type: BATCH_DRAFT_DELETE,
                  draftId,
                })
                .then((result) => {
                  if (result.ok) onCancel();
                  else setSetupError(result.message);
                })
                .catch((error: unknown) => setSetupError(errorText(error)));
            }}
          >
            Cancel setup
          </button>
        </div>
      </div>
    </section>
  );
}

export function ManagerApp({
  deps,
  initialTaskId,
  initialDraftId,
  localSaveHost,
}: {
  deps: ManagerDependencies;
  initialTaskId?: string;
  initialDraftId?: string;
  localSaveHost?: ManagerLocalSaveHost;
}) {
  const [tasks, setTasks] = useState<BatchTask[] | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId);
  const [draftId, setDraftId] = useState(initialDraftId);
  const [mutationError, setMutationError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const [recentResult, selectedResult] = await Promise.all([
        deps.sendMessage<BatchStatusResult>({
          type: BATCH_STATUS_REQUEST,
        }),
        selectedTaskId
          ? deps.sendMessage<BatchStatusResult>({
              type: BATCH_STATUS_REQUEST,
              taskId: selectedTaskId,
            })
          : Promise.resolve(undefined),
      ]);
      const selectedTask = selectedResult?.tasks[0];
      setTasks(
        selectedTask &&
          !recentResult.tasks.some((task) => task.id === selectedTask.id)
          ? [selectedTask, ...recentResult.tasks]
          : recentResult.tasks,
      );
    } catch {
      // The background worker is unreachable; the next poll retries.
    }
  }, [deps, selectedTaskId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const handleMutate = useCallback(
    async (message: unknown) => {
      try {
        const result = await deps.sendMessage<BatchMutationStatus>(message);
        setMutationError(result.ok ? undefined : result.message);
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : String(error),
        );
      }
      await refresh();
    },
    [deps, refresh],
  );

  const handleSelect = useCallback((taskId: string) => {
    setDraftId(undefined);
    setSelectedTaskId(taskId);
    setMutationError(undefined);
    // Keep the URL shareable / reloadable on the selected batch (#58).
    const url = new URL(location.href);
    url.searchParams.set("task", taskId);
    history.replaceState(null, "", url);
  }, []);

  const handleStarted = useCallback((taskId: string) => {
    setDraftId(undefined);
    setSelectedTaskId(taskId);
    const url = new URL(location.href);
    url.searchParams.delete("setup");
    url.searchParams.set("task", taskId);
    history.replaceState(null, "", url);
  }, []);

  const handleCancelSetup = useCallback(() => {
    setDraftId(undefined);
    const url = new URL(location.href);
    url.searchParams.delete("setup");
    history.replaceState(null, "", url);
  }, []);

  // Tasks arrive newest-first (the status router sorts by createdAt).
  const selected = tasks?.find((task) => task.id === selectedTaskId);
  const shown =
    selected ?? (selectedTaskId === undefined ? tasks?.[0] : undefined);

  return (
    <div className="manager-page">
      <header className="manager-header">
        <div className="manager-bar">
          <div className="brand-lockup">
            <span className="brand-mark">
              <LogoMark />
            </span>
            <h1>Transcriptly batch</h1>
          </div>
        </div>
      </header>
      <main className="manager">
        {draftId && (
          <BatchSetup
            draftId={draftId}
            deps={deps}
            localSaveHost={localSaveHost}
            onStarted={handleStarted}
            onCancel={handleCancelSetup}
          />
        )}
        {!draftId && tasks === undefined && (
          <p className="muted loading" role="status">
            Loading batches…
          </p>
        )}

        {!draftId && tasks !== undefined && tasks.length === 0 && (
          <section className="empty-state">
            <div className="state-icon">
              <LibraryBig />
            </div>
            <h2>No batches yet</h2>
            <p className="state-copy">
              Select videos on a playlist or channel Videos page to start one.
            </p>
          </section>
        )}

        {tasks !== undefined &&
          tasks.length > 0 &&
          selectedTaskId !== undefined &&
          !selected && (
            <p className="error-banner" role="alert">
              That batch task no longer exists.
            </p>
          )}

        {!draftId && shown && (
          <BatchTaskDetail
            task={shown}
            mutationError={mutationError}
            localSaveHost={localSaveHost}
            onMutate={(message) => void handleMutate(message)}
          />
        )}

        {!draftId && tasks !== undefined && tasks.length > 0 && (
          <section className="history">
            <h2>Recent batches</h2>
            <ul>
              {tasks.map((task) => {
                const failed = failedItemCount(task);
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      className={`batch-row${task.id === shown?.id ? " is-selected" : ""}`}
                      onClick={() => handleSelect(task.id)}
                    >
                      <span className={`state state-${task.state}`}>
                        {stateLabel(task)}
                      </span>
                      <span className="batch-date">
                        {formatTimestamp(task.createdAt)}
                      </span>
                      <span className="batch-count">
                        {`${doneItemCount(task)}/${task.items.length} done`}
                        {failed > 0 ? ` · ${failed} failed` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
