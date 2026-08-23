import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { ManagerApp, type ManagerDependencies } from "./app";
import "./style.css";

const dependencies: ManagerDependencies = {
  sendMessage: <T,>(message: unknown) =>
    browser.runtime.sendMessage(message) as Promise<T>,
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

// `?task=<id>` deep-links to one batch; without it the newest shows (#58).
const initialTaskId =
  new URLSearchParams(location.search).get("task") ?? undefined;

createRoot(rootElement).render(
  <ManagerApp deps={dependencies} initialTaskId={initialTaskId} />,
);
