import { createBatchExecutor } from "@/batch/executor";
import { createBatchJobStore } from "@/batch/jobs";
import { createLocalSaveClient } from "@/batch/local-save-client";
import { createManagerTabCoordinator } from "@/batch/manager-tabs";
import { createBatchMessageRouter } from "@/batch/router";
import { createBatchSessionGate } from "@/batch/session-gate";
import { createTabVideoCapture } from "@/batch/tab-capture";
import { cloudClient } from "@/cloud/client";
import { createCloudJobStore } from "@/cloud/jobs";
import { createCloudUploadQueue } from "@/cloud/queue";
import {
  type CloudMessage,
  type CloudMessageResult,
  createCloudMessageRouter,
} from "@/cloud/router";
import {
  createIndexedDbDirectoryStore,
  createIndexedDbLocalReceiptStore,
} from "@/local-save";
import type { BatchMessage, BatchMessageResult } from "@/shared/messages";

/** Wakes the worker at least once a minute to drain pending work. */
const QUEUE_ALARM = "transcriptly:cloud-queue";

/**
 * The background service worker is the only place that talks to the cloud
 * and the only place that runs batch capture (#26): it opens one watch tab
 * per selected video, captures, and persists every per-destination result
 * so progress survives popup close and worker restarts. Local writes are
 * delegated to the manager page's Local Save Host (the worker cannot
 * request folder permissions; the page can, via a click, #59); cloud
 * uploads live in an IndexedDB-backed FIFO queue (#35) and are never
 * replayed automatically after a failure (#36).
 *
 * Batch interruption is ask-first (#59): after a browser restart the
 * session gate pauses unfinished tasks (reason `browser-restart`) and no
 * wake entry point may resume them without the user's confirmation.
 * Within the same browser session a worker restart keeps the old
 * re-queue-and-continue behavior.
 */
export default defineBackground({
  main() {
    const cloudStore = createCloudJobStore();
    const queue = createCloudUploadQueue({
      store: cloudStore,
      client: cloudClient,
    });
    const router = createCloudMessageRouter({ client: cloudClient, queue });
    const batchStore = createBatchJobStore();
    const directoryStore = createIndexedDbDirectoryStore();
    const receiptStore = createIndexedDbLocalReceiptStore();

    // One manager tab for everything (#59): Start in selection mode, the
    // popup entry, the floating capsule, and the Local Save Host client
    // all reuse it through this coordinator.
    const managerTabs = createManagerTabCoordinator({
      tabs: {
        query: (options) => browser.tabs.query(options),
        create: (url, createOptions) =>
          browser.tabs.create({ url, ...createOptions }),
        update: (tabId, update) => browser.tabs.update(tabId, update),
      },
      managerUrl: browser.runtime.getURL("/manager.html"),
    });

    const localSaveClient = createLocalSaveClient({
      managerTabs,
      tabs: {
        sendMessage: <T>(tabId: number, message: unknown) =>
          browser.tabs.sendMessage<unknown, T>(tabId, message),
      },
    });

    const executor = createBatchExecutor({
      store: batchStore,
      captureVideo: createTabVideoCapture({
        tabs: {
          create: (options) => browser.tabs.create(options),
          remove: (tabId) => browser.tabs.remove(tabId),
          sendMessage: <T>(tabId: number, message: unknown) =>
            browser.tabs.sendMessage<unknown, T>(tabId, message),
        },
      }),
      preflightLocal: () => localSaveClient.preflight(),
      saveLocal: (capture, markdownFormat) =>
        localSaveClient.save(capture, markdownFormat),
      enqueueCloud: async (capture) => {
        const job = await queue.enqueue(capture);
        return { jobId: job.id };
      },
      getCloudJob: (jobId) => cloudStore.get(jobId),
      findLocalReceipt: async (videoId) => {
        const directory = await directoryStore.get();
        const receipts = await receiptStore.getAll(directory?.name);
        return receipts.find((receipt) => receipt.videoId === videoId);
      },
      findCloudReceipt: async (videoId) => {
        const status = await cloudStore.getStatus(videoId);
        const current = status.current;
        return current?.state === "saved" ? current.receipt : undefined;
      },
    });

    const batchRouter = createBatchMessageRouter({
      store: batchStore,
      executor,
      getSavedDirectory: () => directoryStore.get(),
      getLocalReceipts: (directoryName?: string) =>
        receiptStore.getAll(directoryName),
      getCloudStatus: (videoId?: string) => cloudStore.getStatus(videoId),
      getCloudSession: () => cloudClient.getSession(),
      openManager: async (taskId: string) => {
        await managerTabs.open(taskId);
      },
    });

    browser.runtime.onMessage.addListener(
      async (
        message: CloudMessage | BatchMessage,
      ): Promise<CloudMessageResult | BatchMessageResult | undefined> => {
        const batchResult = await batchRouter.handle(message as BatchMessage);
        if (batchResult !== undefined) return batchResult;
        return router.handle(message as CloudMessage);
      },
    );

    // Created synchronously at worker start: the very first call pauses
    // unfinished batches after a browser restart, before any wake.
    const sessionGate = createBatchSessionGate({
      store: batchStore,
      storage: {
        get: async (key) => (await browser.storage.session.get(key))[key],
        set: (key, value) => browser.storage.session.set({ [key]: value }),
      },
    });
    const sessionReady = sessionGate.ensureSession();

    // Every batch wake entry point - worker init, onStartup, onInstalled,
    // and the per-minute alarm - passes through the same session gate:
    // after a browser restart tasks stay paused for explicit confirmation
    // (#59); within the same browser session a worker restart resumes as
    // before. Cloud queue recovery keeps its own semantics either way.
    const recoverAndDrain = async () => {
      const session = await sessionReady;
      void queue.recoverAndDrain();
      if (session === "same-session") void executor.wake();
    };

    browser.runtime.onStartup?.addListener(() => void recoverAndDrain());
    browser.runtime.onInstalled?.addListener(() => void recoverAndDrain());

    browser.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === QUEUE_ALARM) void recoverAndDrain();
    });

    void recoverAndDrain();
  },
});
