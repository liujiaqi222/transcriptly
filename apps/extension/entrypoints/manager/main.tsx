import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { webOrigin } from "@/cloud/client";
import { createSavePreferences } from "@/save-preferences";
import { ManagerApp, type ManagerDependencies } from "./app";
import { mountManagerLocalSaveHost } from "./local-save-host";
import "./style.css";

const savePreferences = createSavePreferences({
  get: (keys) => browser.storage.local.get(keys),
  set: (values) => browser.storage.local.set(values),
});

const dependencies: ManagerDependencies = {
  sendMessage: <T,>(message: unknown) =>
    browser.runtime.sendMessage(message) as Promise<T>,
  async openCloudSignIn() {
    await browser.tabs.create({ url: `${webOrigin}/sign-in` });
  },
  preferences: savePreferences,
};

// The manager page doubles as the Local Save Host (#59): folder
// authorization and Markdown writes happen here, in the same workbench
// the user already watches. It stays open as long as the user wants -
// there is no save-agent-style idle auto-close.
const localSaveHost = mountManagerLocalSaveHost();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

// `?task=<id>` deep-links to one batch; without it the newest shows (#58).
const initialTaskId =
  new URLSearchParams(location.search).get("task") ?? undefined;
const initialDraftId =
  new URLSearchParams(location.search).get("setup") ?? undefined;

createRoot(rootElement).render(
  <ManagerApp
    deps={dependencies}
    initialTaskId={initialTaskId}
    initialDraftId={initialDraftId}
    localSaveHost={localSaveHost}
  />,
);
