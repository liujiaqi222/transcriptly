import type { Capture } from "@transcriptly/schema";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { webOrigin } from "@/cloud/client";
import type { CloudQueueStatus } from "@/cloud/jobs";
import { createLocalMarkdownSaver } from "@/local-save";
import { createSavePreferences } from "@/save-preferences";
import { ExtensionErrorBoundary } from "@/shared/error-boundary";
import {
  BATCH_ENTER_SELECTION_REQUEST,
  BATCH_OPEN_MANAGER,
  BATCH_RESUME,
  BATCH_STATUS_REQUEST,
  type BatchEnterSelectionStatus,
  type BatchMutationStatus,
  type BatchStatusResult,
  CAPTURE_REQUEST,
  type CaptureResponseMessage,
  CLOUD_JOB_RETRY,
  CLOUD_QUEUE_STATUS_REQUEST,
  CLOUD_SAVE_ENQUEUE,
  CLOUD_SESSION_REQUEST,
  CLOUD_SIGN_OUT_REQUEST,
  type CloudJobRetryStatus,
  type CloudSaveEnqueueStatus,
  type CloudSessionStatus,
  type CloudSignOutStatus,
} from "@/shared/messages";
import { initExtensionSentry } from "@/shared/sentry-client";
import { Popup, type PopupDependencies } from "./app";
import "./style.css";

initExtensionSentry();

const savePreferences = createSavePreferences({
  get: (keys) => browser.storage.local.get(keys),
  set: (values) => browser.storage.local.set(values),
});

const dependencies: PopupDependencies = {
  account: {
    async getCloudSession(): Promise<CloudSessionStatus> {
      const response = await browser.runtime.sendMessage({
        type: CLOUD_SESSION_REQUEST,
      });
      return response as CloudSessionStatus;
    },
    async openCloudSignIn(): Promise<void> {
      await browser.tabs.create({ url: `${webOrigin}/sign-in` });
    },
    async signOutCloud(): Promise<CloudSignOutStatus> {
      const response = await browser.runtime.sendMessage({
        type: CLOUD_SIGN_OUT_REQUEST,
      });
      return response as CloudSignOutStatus;
    },
  },
  async getActiveTab() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab ? { id: tab.id, url: tab.url } : undefined;
  },
  async requestCapture(tabId: number): Promise<CaptureResponseMessage> {
    const response = await browser.tabs.sendMessage(tabId, {
      type: CAPTURE_REQUEST,
    });
    return response as CaptureResponseMessage;
  },
  async enterBatchSelection(tabId: number): Promise<BatchEnterSelectionStatus> {
    const response = await browser.tabs.sendMessage(tabId, {
      type: BATCH_ENTER_SELECTION_REQUEST,
    });
    return response as BatchEnterSelectionStatus;
  },
  async navigateTab(tabId: number, url: string): Promise<void> {
    await browser.tabs.update(tabId, { url });
  },
  async getBatchStatus(): Promise<BatchStatusResult> {
    const response = await browser.runtime.sendMessage({
      type: BATCH_STATUS_REQUEST,
    });
    return response as BatchStatusResult;
  },
  openBatchManager: (taskId: string) => {
    // Routed through the background worker's manager-tab coordinator so
    // an already-open manager page is reused instead of duplicated (#59).
    void browser.runtime
      .sendMessage({ type: BATCH_OPEN_MANAGER, taskId })
      .catch(() => undefined);
  },
  resumeBatch: async (taskId: string) =>
    (await browser.runtime.sendMessage({
      type: BATCH_RESUME,
      taskId,
    })) as BatchMutationStatus,
  closePopup: () => window.close(),
  createSaver: () => createLocalMarkdownSaver(),

  markdown: {
    getPreference: () => savePreferences.getMarkdownFormat(),
    setPreference: (format) => savePreferences.setMarkdownFormat(format),
  },
  cloud: {
    async enqueueCloudSave(
      capture: Capture,
      options?: { confirmPublicProfile?: boolean },
    ): Promise<CloudSaveEnqueueStatus> {
      const response = await browser.runtime.sendMessage({
        type: CLOUD_SAVE_ENQUEUE,
        capture,
        confirmPublicProfile: options?.confirmPublicProfile,
      });
      return response as CloudSaveEnqueueStatus;
    },
    async getCloudQueueStatus(videoId: string): Promise<CloudQueueStatus> {
      const response = await browser.runtime.sendMessage({
        type: CLOUD_QUEUE_STATUS_REQUEST,
        videoId,
      });
      return response as CloudQueueStatus;
    },
    async retryCloudJob(jobId: string): Promise<CloudJobRetryStatus> {
      const response = await browser.runtime.sendMessage({
        type: CLOUD_JOB_RETRY,
        jobId,
      });
      return response as CloudJobRetryStatus;
    },
    getCloudPreference: () => savePreferences.getPublicContributionEnabled(),
    setCloudPreference: (enabled) =>
      savePreferences.setPublicContributionEnabled(enabled),
  },
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <ExtensionErrorBoundary surface="popup">
    <Popup deps={dependencies} />
  </ExtensionErrorBoundary>,
);
