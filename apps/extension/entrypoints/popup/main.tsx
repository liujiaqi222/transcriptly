import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { webOrigin } from "@/cloud/client";
import { createLocalMarkdownSaver } from "@/local-save";
import {
  CAPTURE_REQUEST,
  type CaptureResponseMessage,
  CLOUD_SESSION_REQUEST,
  CLOUD_SIGN_OUT_REQUEST,
  type CloudSessionStatus,
  type CloudSignOutStatus,
} from "@/shared/messages";
import { Popup, type PopupDependencies } from "./app";
import "./style.css";

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
  createSaver: () => createLocalMarkdownSaver(),
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(<Popup deps={dependencies} />);
