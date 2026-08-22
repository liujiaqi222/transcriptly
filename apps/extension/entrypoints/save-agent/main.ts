import type { Capture } from "@transcriptly/schema";
import {
  createLocalMarkdownSaver,
  type LocalMarkdownSaver,
} from "@/local-save";
import {
  SAVE_AGENT_PING,
  SAVE_AGENT_SAVE,
  type SaveAgentPingMessage,
  type SaveAgentSaveMessage,
  type SaveAgentSaveResponse,
} from "@/shared/messages";

/**
 * The save-agent page (#26): the background worker cannot show Chrome's
 * folder-permission prompt, so every local batch write is delegated here.
 * When write access has expired (Chrome drops it on browser restart), this
 * page activates itself and waits for one click - the user gesture that
 * makes `requestPermission()` succeed - then saves. One grant covers the
 * rest of the session, so later videos save silently.
 */

const IDLE_CLOSE_MS = 5 * 60 * 1000;
const IDLE_CHECK_MS = 30_000;

let saverPromise: Promise<LocalMarkdownSaver> | undefined;
let grantPending = false;
let lastActivity = Date.now();

const status = document.querySelector<HTMLElement>(".status");
const grantButton = document.querySelector<HTMLButtonElement>(".grant");

function getSaver(): Promise<LocalMarkdownSaver> {
  saverPromise ??= createLocalMarkdownSaver().catch((error: unknown) => {
    saverPromise = undefined;
    throw error;
  });
  return saverPromise;
}

function setStatus(text: string) {
  if (status && status.textContent !== text) status.textContent = text;
}

async function activateOwnTab(): Promise<void> {
  try {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) {
      await browser.tabs.update(tab.id, { active: true });
    }
  } catch {
    // Staying in the background is fine; the batch panel also shows errors.
  }
}

/** Show the grant button and wait for the user's click. */
function requestFolderAccess(): Promise<void> {
  return new Promise((resolve) => {
    grantPending = true;
    setStatus(
      "Transcriptly needs write access to your save folder for batch captures. Grant it once - it lasts until Chrome restarts.",
    );
    if (grantButton) grantButton.hidden = false;
    void activateOwnTab();
    const onClick = () => {
      grantButton?.removeEventListener("click", onClick);
      if (grantButton) grantButton.hidden = true;
      grantPending = false;
      setStatus("Saving…");
      resolve();
    };
    grantButton?.addEventListener("click", onClick);
  });
}

async function handleSave(capture: Capture): Promise<SaveAgentSaveResponse> {
  lastActivity = Date.now();
  try {
    const saver = await getSaver();
    const directoryName = await saver.getSavedDirectoryName();
    if (!directoryName) {
      return {
        ok: false,
        message:
          "No save folder is selected. Open the Transcriptly popup and choose a folder, then retry.",
      };
    }
    if (!(await saver.hasWritePermission())) {
      await requestFolderAccess();
    }
    const result = await saver.save(capture);
    setStatus(`Saved ${result.filename}`);
    return { ok: true, ...result };
  } catch (error) {
    grantPending = false;
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Save failed: ${message}`);
    return { ok: false, message };
  }
}

browser.runtime.onMessage.addListener(
  (
    message: SaveAgentPingMessage | SaveAgentSaveMessage,
  ): Promise<SaveAgentSaveResponse | { ok: true }> | undefined => {
    if (message?.type === SAVE_AGENT_PING) {
      return Promise.resolve({ ok: true });
    }
    if (message?.type !== SAVE_AGENT_SAVE) return undefined;
    return handleSave(message.capture);
  },
);

// Self-cleanup: a tab nobody needs should not linger forever.
setInterval(() => {
  if (grantPending) return;
  if (Date.now() - lastActivity > IDLE_CLOSE_MS) window.close();
}, IDLE_CHECK_MS);
