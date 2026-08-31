/**
 * Manager tab coordination (#59).
 *
 * `manager.html` is the extension's single batch workbench: progress and
 * setup, controls, folder authorization, and the Local Save Host. Everything
 * that needs the page - Continue in selection mode, the popup entry, the
 * floating capsule, and the worker's local-save client - goes through
 * this coordinator instead of calling `tabs.create()` directly, so:
 *
 * - an existing manager tab is reused (never duplicated), also after a
 *   service-worker restart lost the in-memory tab id (found via query);
 * - concurrent "open manager" and "request the save host" calls share one
 *   lookup/create, so they cannot race into two tabs;
 * - opening for a task deep-links via `?task=<id>` and focuses the tab.
 */

export interface ManagerTabsApi {
  /** `url` accepts Chrome URL patterns (e.g. `.../manager.html*`). */
  query(options: {
    url: string;
  }): Promise<Array<{ id?: number; url?: string }>>;
  create(url: string, options?: { active?: boolean }): Promise<{ id?: number }>;
  update(
    tabId: number,
    update: { active?: boolean; url?: string },
  ): Promise<unknown>;
}

export interface ManagerTabCoordinatorDependencies {
  tabs: ManagerTabsApi;
  /** Full URL of `manager.html` (`browser.runtime.getURL("/manager.html")`). */
  managerUrl: string;
}

export interface ManagerTabCoordinator {
  /** Reuse or open the manager tab, focused, deep-linked to a task. */
  open(taskId?: string): Promise<void>;
  /** Focus the workbench on a not-yet-started selection draft. */
  openSetup(draftId: string): Promise<void>;
  /**
   * Reuse or open (in the background) the manager tab and return its tab
   * id. Used by the Local Save Host client; never changes the shown task.
   */
  ensureOpen(): Promise<number>;
  /** Bring the manager tab to the front, opening it when missing. */
  focus(): Promise<void>;
}

export function createManagerTabCoordinator(
  deps: ManagerTabCoordinatorDependencies,
): ManagerTabCoordinator {
  const { tabs, managerUrl } = deps;
  /** All manager-tab URLs, for tab queries. */
  const anyManagerUrl = `${managerUrl}*`;

  function taskUrl(taskId: string): string {
    return `${managerUrl}?task=${encodeURIComponent(taskId)}`;
  }

  function setupUrl(draftId: string): string {
    return `${managerUrl}?setup=${encodeURIComponent(draftId)}`;
  }

  // Single-flight tab acquisition: concurrent callers share one
  // lookup/create so at most one manager tab is ever created.
  let acquiring: Promise<number> | undefined;

  async function acquireTabId(): Promise<number> {
    const shared = acquiring;
    if (shared) return shared;
    const work = (async () => {
      const matches = await tabs.query({ url: anyManagerUrl });
      const existing = matches.find((tab) => typeof tab.id === "number");
      if (existing?.id !== undefined) return existing.id;
      const tab = await tabs.create(managerUrl, { active: false });
      if (tab.id === undefined) {
        throw new Error("Could not open the Transcriptly manager page.");
      }
      return tab.id;
    })();
    acquiring = work.finally(() => {
      acquiring = undefined;
    });
    return work;
  }

  async function open(taskId?: string): Promise<void> {
    const tabId = await acquireTabId();
    if (taskId) {
      // Deep-link only when the tab is not already on that task - an
      // unnecessary URL update would reload the page mid-use.
      const target = taskUrl(taskId);
      const matches = await tabs.query({ url: target });
      if (!matches.some((tab) => tab.id === tabId)) {
        await tabs.update(tabId, { url: target });
      }
    }
    await tabs.update(tabId, { active: true });
  }

  return {
    open,
    async openSetup(draftId) {
      const tabId = await acquireTabId();
      const target = setupUrl(draftId);
      const matches = await tabs.query({ url: target });
      if (!matches.some((tab) => tab.id === tabId)) {
        await tabs.update(tabId, { url: target });
      }
      await tabs.update(tabId, { active: true });
    },
    ensureOpen: () => acquireTabId(),
    async focus() {
      const tabId = await acquireTabId();
      await tabs.update(tabId, { active: true });
    },
  };
}
