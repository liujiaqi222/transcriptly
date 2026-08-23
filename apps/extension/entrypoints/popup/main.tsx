import type { Capture } from "@transcriptly/schema";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { webOrigin } from "@/cloud/client";
import type { CloudQueueStatus } from "@/cloud/jobs";
import { createLocalMarkdownSaver } from "@/local-save";
import {
  BATCH_ENTER_SELECTION_REQUEST,
  type BatchEnterSelectionStatus,
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
import { Popup, type PopupDependencies } from "./app";
import "./style.css";

/** chrome.storage.local key for the remembered Cloud preference (#35). */
const CLOUD_PREFERENCE_KEY = "cloud-save-enabled";

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
  closePopup: () => window.close(),
  createSaver: () => createLocalMarkdownSaver(),
  cloud: {
    async enqueueCloudSave(capture: Capture): Promise<CloudSaveEnqueueStatus> {
      const response = await browser.runtime.sendMessage({
        type: CLOUD_SAVE_ENQUEUE,
        capture,
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
    async getCloudPreference(): Promise<boolean> {
      const stored = await browser.storage.local.get(CLOUD_PREFERENCE_KEY);
      return stored[CLOUD_PREFERENCE_KEY] === true;
    },
    async setCloudPreference(enabled: boolean): Promise<void> {
      await browser.storage.local.set({
        [CLOUD_PREFERENCE_KEY]: enabled,
      });
    },
  },
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(<Popup deps={dependencies} />);
