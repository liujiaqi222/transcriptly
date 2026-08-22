import type { Capture } from "@transcriptly/schema";
import type { LocalSaveResult } from "@/local-save";
import {
  SAVE_AGENT_PING,
  SAVE_AGENT_SAVE,
  type SaveAgentSaveResponse,
} from "@/shared/messages";

/**
 * Service-worker side of the save-agent page (#26). The worker cannot
 * request folder permissions itself, so every local batch write goes
 * through a dedicated extension page; this client keeps that page open,
 * wakes it when needed, and maps its answers back to LocalSaveResult.
 */

export const AGENT_READY_TIMEOUT_MS = 30_000;
/** Includes the time a user may need to click "Grant folder access". */
export const AGENT_SAVE_TIMEOUT_MS = 5 * 60_000;
const PING_INTERVAL_MS = 500;

export interface AgentTabsApi {
  create(url: string): Promise<{ id?: number }>;
  sendMessage<T>(tabId: number, message: unknown): Promise<T>;
}

export interface SaveAgentClientOptions {
  tabs: AgentTabsApi;
  /** The save-agent page URL (`browser.runtime.getURL("save-agent.html")`). */
  agentUrl: string;
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface SaveAgentClient {
  save(capture: Capture): Promise<LocalSaveResult>;
}

export function createSaveAgentClient(
  options: SaveAgentClientOptions,
): SaveAgentClient {
  const { tabs, agentUrl } = options;
  const delay =
    options.delay ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());

  let agentTabId: number | undefined;

  async function withDeadline<T>(
    work: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), Math.max(0, ms));
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function ping(tabId: number): Promise<boolean> {
    try {
      await tabs.sendMessage(tabId, { type: SAVE_AGENT_PING });
      return true;
    } catch {
      return false;
    }
  }

  async function ensureAgentTab(): Promise<number> {
    if (agentTabId !== undefined && (await ping(agentTabId))) {
      return agentTabId;
    }
    const tab = await tabs.create(agentUrl);
    if (tab.id === undefined) {
      throw new Error("Could not open the Transcriptly save page.");
    }
    const deadline = now() + AGENT_READY_TIMEOUT_MS;
    for (;;) {
      if (await ping(tab.id)) {
        agentTabId = tab.id;
        return tab.id;
      }
      if (now() >= deadline) {
        throw new Error("The Transcriptly save page did not open in time.");
      }
      await delay(PING_INTERVAL_MS);
    }
  }

  return {
    async save(capture: Capture): Promise<LocalSaveResult> {
      const tabId = await ensureAgentTab();
      const response = await withDeadline(
        tabs.sendMessage<SaveAgentSaveResponse>(tabId, {
          type: SAVE_AGENT_SAVE,
          capture,
        }),
        AGENT_SAVE_TIMEOUT_MS,
        "Timed out waiting for folder access in the Transcriptly save tab. Retry after granting access.",
      );
      if (
        !response.ok ||
        typeof response.directoryName !== "string" ||
        typeof response.filename !== "string"
      ) {
        throw new Error(
          response.message ?? "The local save failed without a reason.",
        );
      }
      return {
        directoryName: response.directoryName,
        filename: response.filename,
        ...(response.receiptError
          ? { receiptError: response.receiptError }
          : {}),
      };
    },
  };
}
