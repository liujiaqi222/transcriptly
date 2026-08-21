import { cloudClient } from "@/cloud/client";
import { createCloudJobStore } from "@/cloud/jobs";
import { createCloudUploadQueue } from "@/cloud/queue";
import {
  type CloudMessage,
  type CloudMessageResult,
  createCloudMessageRouter,
} from "@/cloud/router";

/** Wakes the worker at least once a minute to drain pending uploads. */
const QUEUE_ALARM = "transcriptly:cloud-queue";

/**
 * The background service worker is the only place that talks to the cloud.
 * Cloud uploads live in an IndexedDB-backed FIFO queue (#35) so they survive
 * popup close and worker restarts; failures are never replayed
 * automatically - the user retries explicitly (#36).
 */
export default defineBackground({
  main() {
    const queue = createCloudUploadQueue({
      store: createCloudJobStore(),
      client: cloudClient,
    });
    const router = createCloudMessageRouter({ client: cloudClient, queue });

    browser.runtime.onMessage.addListener(
      (message: CloudMessage): Promise<CloudMessageResult | undefined> =>
        router.handle(message),
    );

    const recoverAndDrain = () => void queue.recoverAndDrain();

    browser.runtime.onStartup?.addListener(recoverAndDrain);
    browser.runtime.onInstalled?.addListener(recoverAndDrain);

    browser.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === QUEUE_ALARM) recoverAndDrain();
    });

    recoverAndDrain();
  },
});
