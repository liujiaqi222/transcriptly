import type { BatchDraftStore } from "@/batch/drafts";
import type { CloudQueueStatus, CloudReceipt } from "@/cloud/jobs";
import type { LocalDirectoryHandle, LocalSaveReceipt } from "@/local-save";
import { normalizeMarkdownFormat } from "@/markdown-format";
import {
  BATCH_DRAFT_DELETE,
  BATCH_DRAFT_REQUEST,
  BATCH_LOOKUP_REQUEST,
  BATCH_OPEN_MANAGER,
  BATCH_PAUSE,
  BATCH_PREPARE,
  BATCH_RESUME,
  BATCH_RETRY_ITEM,
  BATCH_START,
  BATCH_STATUS_REQUEST,
  BATCH_STOP,
  type BatchLookupRequestMessage,
  type BatchLookupResult,
  type BatchLookupVideo,
  type BatchMessage,
  type BatchMessageResult,
  type BatchMutationStatus,
  type BatchStartMessage,
  type BatchStartStatus,
  type BatchStatusRequestMessage,
  type BatchStatusResult,
  type CloudSessionStatus,
} from "@/shared/messages";
import type { BatchExecutor } from "./executor";
import { savedCloudReceipt } from "./executor";
import type { BatchJobStore, BatchTask } from "./jobs";

/**
 * The background message surface for batch capture (#26). The YouTube
 * selection panel only prepares drafts (#102); the Manager setup view
 * sends the start after folder and destination setup. The router still
 * validates every start itself (Cloud session, local folder) - never
 * trusting the page UI alone - before persisting a task and handing
 * execution to the BatchExecutor.
 */

export interface BatchRouterDependencies {
  store: BatchJobStore;
  drafts: BatchDraftStore;
  executor: BatchExecutor;
  getSavedDirectory(): Promise<LocalDirectoryHandle | undefined>;
  getLocalReceipts(directoryName?: string): Promise<LocalSaveReceipt[]>;
  getCloudStatus(videoId?: string): Promise<CloudQueueStatus>;
  getCloudSession(): Promise<CloudSessionStatus>;
  openManager(taskId: string): Promise<void>;
  openSetup(draftId: string): Promise<void>;
}

/** How many recent tasks the status request returns without a taskId. */
const RECENT_TASK_LIMIT = 10;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function createBatchMessageRouter(deps: BatchRouterDependencies) {
  async function start(message: BatchStartMessage): Promise<BatchStartStatus> {
    try {
      const destinations = unique(message.destinations);
      if (message.videos.length === 0) {
        return { ok: false, message: "Select at least one video." };
      }
      if (destinations.length === 0) {
        return { ok: false, message: "Select at least one save destination." };
      }

      let directoryName: string | undefined;
      if (destinations.includes("local")) {
        const directory = await deps.getSavedDirectory();
        if (!directory) {
          return {
            ok: false,
            message:
              "Choose a local save folder in the batch setup before starting.",
          };
        }
        directoryName = directory.name;
        // Note: write permission is intentionally NOT pre-checked here -
        // the worker cannot request it. The executor's per-item preflight
        // (#59) pauses the task with a grant prompt in the manager page
        // when the grant is missing or has expired.
      }
      // Never trust the page UI alone: re-check the Cloud session (#26).
      if (destinations.includes("cloud")) {
        const session = await deps.getCloudSession();
        if (session.status !== "signed-in") {
          return {
            ok: false,
            message:
              "Sign in to Transcriptly in batch setup before contributing publicly.",
          };
        }
        if (
          !session.publicContributionConfirmed &&
          message.confirmPublicProfile !== true
        ) {
          return {
            ok: false,
            message:
              "Confirm the public disclosure before adding it to a batch.",
          };
        }
      }

      const localReceipts = destinations.includes("local")
        ? await deps.getLocalReceipts(directoryName)
        : [];
      const cloudReceipts: CloudReceipt[] = [];
      if (destinations.includes("cloud")) {
        for (const video of message.videos) {
          const receipt = savedCloudReceipt(
            await deps.getCloudStatus(video.videoId),
          );
          if (receipt) cloudReceipts.push(receipt);
        }
      }

      const task = await deps.store.create(message.videos, {
        destinations,
        markdownFormat: normalizeMarkdownFormat(message.markdownFormat),
        localReceipts,
        cloudReceipts,
        publicProfileConfirmationPending:
          destinations.includes("cloud") &&
          message.confirmPublicProfile === true,
      });
      if (message.draftId) await deps.drafts.delete(message.draftId);
      void deps.executor.wake();
      return { ok: true, taskId: task.id };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not start batch capture.",
      };
    }
  }

  async function prepare(
    videos: import("@/batch/jobs").BatchVideo[],
  ): Promise<import("@/shared/messages").BatchPrepareStatus> {
    try {
      const draft = await deps.drafts.create(videos);
      await deps.openSetup(draft.id);
      return { ok: true, draftId: draft.id };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not open batch setup.",
      };
    }
  }

  async function status(
    message: BatchStatusRequestMessage,
  ): Promise<BatchStatusResult> {
    if (message.taskId) {
      const task = await deps.store.get(message.taskId);
      return { tasks: task ? [task] : [] };
    }
    const tasks = (await deps.store.list()).sort(
      (a: BatchTask, b: BatchTask) => b.createdAt - a.createdAt,
    );
    return { tasks: tasks.slice(0, RECENT_TASK_LIMIT) };
  }

  async function lookup(
    message: BatchLookupRequestMessage,
  ): Promise<BatchLookupResult> {
    const directory = await deps.getSavedDirectory();
    const localReceipts = await deps.getLocalReceipts(directory?.name);
    const savedLocally = new Set(
      localReceipts.map((receipt) => receipt.videoId),
    );
    const videos: BatchLookupVideo[] = [];
    for (const videoId of message.videoIds) {
      const receipt = savedCloudReceipt(await deps.getCloudStatus(videoId));
      videos.push({
        videoId,
        localSaved: savedLocally.has(videoId),
        cloudSaved: Boolean(receipt),
      });
    }
    return { videos };
  }

  async function openManager(taskId: string): Promise<BatchMutationStatus> {
    try {
      await deps.openManager(taskId);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not open the batch manager.",
      };
    }
  }

  return {
    async handle(
      message: BatchMessage,
    ): Promise<BatchMessageResult | undefined> {
      switch (message?.type) {
        case BATCH_PREPARE:
          return prepare(message.videos);

        case BATCH_DRAFT_REQUEST: {
          const draft = await deps.drafts.get(message.draftId);
          return draft
            ? { ok: true, draft }
            : { ok: false, message: "That batch setup no longer exists." };
        }

        case BATCH_DRAFT_DELETE:
          await deps.drafts.delete(message.draftId);
          return { ok: true };

        case BATCH_START:
          return start(message);

        case BATCH_STATUS_REQUEST:
          return status(message);

        case BATCH_LOOKUP_REQUEST:
          return lookup(message);

        case BATCH_OPEN_MANAGER:
          return openManager(message.taskId);

        case BATCH_PAUSE:
          return deps.executor.pause(message.taskId);

        case BATCH_RESUME:
          return deps.executor.resume(message.taskId);

        case BATCH_STOP:
          return deps.executor.stop(message.taskId);

        case BATCH_RETRY_ITEM:
          return deps.executor.retryItem(
            message.taskId,
            message.videoId,
            message.destinations,
          );

        default:
          return undefined;
      }
    },
  };
}
