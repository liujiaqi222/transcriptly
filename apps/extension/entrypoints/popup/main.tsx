import React from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { createLocalMarkdownSaver } from "../../local-save";
import { CAPTURE_REQUEST, type CaptureResponseMessage } from "../../shared/messages";
import { Popup, type PopupDependencies } from "./app";
import "./style.css";

const dependencies: PopupDependencies = {
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

createRoot(document.getElementById("root")!).render(<Popup deps={dependencies} />);
