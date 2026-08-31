import type { MarkdownFormat } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import {
  createLocalMarkdownSaver,
  type LocalMarkdownSaver,
} from "@/local-save";
import { normalizeMarkdownFormat } from "@/markdown-format";
import {
  MANAGER_LOCAL_PING,
  MANAGER_LOCAL_PREFLIGHT,
  MANAGER_LOCAL_SAVE,
  type ManagerLocalPreflightResponse,
  type ManagerLocalSaveResponse,
} from "@/shared/messages";

/**
 * Manager Local Save Host (#59).
 *
 * The merged workbench page hosts local batch writes: the background
 * worker cannot show Chrome's folder-permission prompt, but this page
 * can - from the user's click on "Grant folder access & continue" in the
 * manager UI. Permission answers are typed results and return
 * immediately: the worker pauses the batch on `permission-required`
 * instead of waiting, and this page shows the prompt.
 *
 * This module is deliberately separate from the React UI (module seam):
 * it owns folder access and file writes, is independently testable, and
 * only publishes a small status surface for the UI to render.
 */

export interface ManagerLocalSaveHostStatus {
  /** The saved folder's name; undefined when none is selected. */
  directoryName?: string;
  /** Whether the folder can be written without a permission prompt. */
  writePermission: boolean;
}

export interface ManagerLocalSaveHost {
  getStatus(): ManagerLocalSaveHostStatus;
  /** Re-render hook for the UI; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Refresh the remembered folder and current permission for setup UI. */
  checkAccess(): Promise<ManagerLocalSaveHostStatus>;
  /**
   * Must run inside the grant button's user gesture (Chrome requires it
   * for both the permission prompt and the folder picker).
   */
  grantAccess(): Promise<"granted" | "denied" | "no-directory">;
  /** Always opens the directory picker, even when the current grant is valid. */
  changeDirectory(): Promise<"changed" | "cancelled">;
}

export interface ManagerLocalSaveHostOptions {
  createSaver?: () => Promise<LocalMarkdownSaver>;
  /** Registers the runtime message listener; defaults to browser.runtime. */
  addListener?(listener: (message: unknown) => unknown): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mountManagerLocalSaveHost(
  options: ManagerLocalSaveHostOptions = {},
): ManagerLocalSaveHost {
  const createSaver = options.createSaver ?? createLocalMarkdownSaver;
  const listeners = new Set<() => void>();
  // Replaced (not mutated) on every change: a stable reference for
  // `useSyncExternalStore` in the UI.
  let status: ManagerLocalSaveHostStatus = { writePermission: false };

  let saverPromise: Promise<LocalMarkdownSaver> | undefined;

  function getSaver(): Promise<LocalMarkdownSaver> {
    saverPromise ??= createSaver().catch((error: unknown) => {
      saverPromise = undefined;
      throw error;
    });
    return saverPromise;
  }

  function setStatus(
    directoryName: string | undefined,
    writePermission: boolean,
  ) {
    status = { directoryName, writePermission };
    for (const listener of listeners) listener();
  }

  async function preflight(): Promise<ManagerLocalPreflightResponse> {
    try {
      const saver = await getSaver();
      const directoryName = await saver.getSavedDirectoryName();
      if (!directoryName) {
        setStatus(undefined, false);
        return { ok: false, reason: "no-directory" };
      }
      const granted = await saver.hasWritePermission();
      setStatus(directoryName, granted);
      return granted
        ? { ok: true, directoryName }
        : { ok: false, reason: "permission-required", directoryName };
    } catch (error) {
      return { ok: false, reason: "error", message: errorMessage(error) };
    }
  }

  async function save(
    capture: Capture,
    markdownFormat: MarkdownFormat,
  ): Promise<ManagerLocalSaveResponse> {
    let saver: LocalMarkdownSaver;
    try {
      saver = await getSaver();
    } catch (error) {
      return { ok: false, reason: "error", message: errorMessage(error) };
    }
    const directoryName = await saver.getSavedDirectoryName();
    if (!directoryName) {
      setStatus(undefined, false);
      return { ok: false, reason: "no-directory" };
    }
    // Permission missing (expired grant, revoked between the executor's
    // preflight and this write): answer immediately and typed. No
    // waiting for the user here - the batch pauses and this page shows
    // the grant prompt (#59).
    if (!(await saver.hasWritePermission())) {
      setStatus(directoryName, false);
      return { ok: false, reason: "permission-required", directoryName };
    }
    try {
      const result = await saver.save(capture, undefined, markdownFormat);
      setStatus(directoryName, true);
      return { ok: true, ...result };
    } catch (error) {
      // The grant may have been revoked after the check above: the same
      // pause path as a preflight miss.
      if (!(await saver.hasWritePermission())) {
        setStatus(directoryName, false);
        return { ok: false, reason: "permission-required", directoryName };
      }
      return { ok: false, reason: "error", message: errorMessage(error) };
    }
  }

  const listener = (message: unknown) => {
    const type = (message as { type?: string } | null)?.type;
    if (type === MANAGER_LOCAL_PING) return Promise.resolve({ ok: true });
    if (type === MANAGER_LOCAL_PREFLIGHT) return preflight();
    if (type === MANAGER_LOCAL_SAVE) {
      const saveMessage = message as {
        capture: Capture;
        markdownFormat?: MarkdownFormat;
      };
      return save(
        saveMessage.capture,
        normalizeMarkdownFormat(saveMessage.markdownFormat),
      );
    }
    // Not ours: let another listener (the background worker) answer.
    return undefined;
  };

  if (options.addListener) {
    options.addListener(listener);
  } else {
    browser.runtime.onMessage.addListener(listener);
  }

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async checkAccess() {
      await preflight();
      return status;
    },
    async grantAccess() {
      const saver = await getSaver();
      const directoryName = await saver.getSavedDirectoryName();
      if (!directoryName) {
        // No folder at all: the same click is the gesture for the picker.
        try {
          const next = await saver.changeDirectory();
          setStatus(next, true);
          return "granted";
        } catch {
          return "no-directory";
        }
      }
      const granted = await saver.requestWritePermission();
      setStatus(directoryName, granted);
      return granted ? "granted" : "denied";
    },
    async changeDirectory() {
      const saver = await getSaver();
      try {
        const directoryName = await saver.changeDirectory();
        setStatus(directoryName, true);
        return "changed";
      } catch {
        return "cancelled";
      }
    },
  };
}
