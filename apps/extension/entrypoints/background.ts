import { createBatchExecutor } from "@/batch/executor";
import { createBatchJobStore } from "@/batch/jobs";
import { createSaveAgentClient } from "@/batch/local-save-agent";
import { createBatchMessageRouter } from "@/batch/router";
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
 * delegated to the save-agent page (the worker cannot request folder
 * permissions); cloud uploads live in an IndexedDB-backed FIFO queue (#35)
 * and are never replayed automatically after a failure (#36).
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

    // Local batch writes go through the save-agent page: the worker cannot
    // show Chrome's folder-permission prompt, the page can (via a click).
    const saveAgent = createSaveAgentClient({
      tabs: {
        create: (url: string) => browser.tabs.create({ url, active: false }),
        sendMessage: <T>(tabId: number, message: unknown) =>
          browser.tabs.sendMessage<unknown, T>(tabId, message),
      },
      agentUrl: browser.runtime.getURL("/save-agent.html"),
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
      saveLocal: (capture) => saveAgent.save(capture),
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

    const recoverAndDrain = () => {
      void queue.recoverAndDrain();
      void executor.wake();
    };

    browser.runtime.onStartup?.addListener(recoverAndDrain);
    browser.runtime.onInstalled?.addListener(recoverAndDrain);

    browser.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === QUEUE_ALARM) recoverAndDrain();
    });

    recoverAndDrain();
  },
});
