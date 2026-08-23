import { describe, expect, it, vi } from "vitest";
import {
  createManagerTabCoordinator,
  type ManagerTabsApi,
} from "../batch/manager-tabs";

const MANAGER_URL = "chrome-extension://abc/manager.html";

interface Tab {
  id: number;
  url: string;
  active: boolean;
}

function createTabs(existing: Tab[] = []) {
  const tabs = new Map(existing.map((tab) => [tab.id, { ...tab }]));
  let nextId = 100;
  const api: ManagerTabsApi = {
    query: vi.fn(async (options: { url: string }) => {
      // Chrome URL-pattern semantics: "manager.html*" also matches
      // "manager.html?task=...".
      const pattern = options.url.replace(/\*$/, "");
      return [...tabs.values()]
        .filter(
          (tab) => tab.url === pattern || tab.url.startsWith(`${pattern}?`),
        )
        .map((tab) => ({ id: tab.id, url: tab.url }));
    }),
    create: vi.fn(async (url: string, options?: { active?: boolean }) => {
      nextId += 1;
      tabs.set(nextId, {
        id: nextId,
        url,
        active: options?.active ?? false,
      });
      return { id: nextId };
    }),
    update: vi.fn(
      async (tabId: number, update: { active?: boolean; url?: string }) => {
        const tab = tabs.get(tabId);
        if (!tab) throw new Error("no tab");
        if (update.active !== undefined) tab.active = update.active;
        if (update.url !== undefined) tab.url = update.url;
        return tab;
      },
    ),
  };
  return { api, tabs, createCount: () => nextId - 100 };
}

describe("manager tab coordinator (#59)", () => {
  it("reuses an existing manager tab instead of creating a second one", async () => {
    const { api, createCount } = createTabs([
      { id: 7, url: MANAGER_URL, active: false },
    ]);
    const coordinator = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });

    await coordinator.open("task-1");

    expect(createCount()).toBe(0);
    expect(api.update).toHaveBeenCalledWith(7, {
      url: `${MANAGER_URL}?task=task-1`,
    });
    expect(api.update).toHaveBeenCalledWith(7, { active: true });
  });

  it("reuses a tab that is already deep-linked to the same task without reloading", async () => {
    const { api, createCount } = createTabs([
      { id: 7, url: `${MANAGER_URL}?task=task-1`, active: false },
    ]);
    const coordinator = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });

    await coordinator.open("task-1");

    expect(createCount()).toBe(0);
    for (const call of vi.mocked(api.update).mock.calls) {
      expect(call[1].url).toBeUndefined();
    }
    expect(api.update).toHaveBeenCalledWith(7, { active: true });
  });

  it("creates and focuses one manager tab when none exists", async () => {
    const { api, createCount } = createTabs();
    const coordinator = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });

    await coordinator.open("task-1");

    expect(createCount()).toBe(1);
    expect(api.update).toHaveBeenCalledWith(101, { active: true });
  });

  it("does not create two tabs when open and ensureOpen race", async () => {
    const { api, createCount } = createTabs();
    const coordinator = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });

    await Promise.all([coordinator.open("task-1"), coordinator.ensureOpen()]);

    expect(createCount()).toBe(1);
  });

  it("ensureOpen does not focus or re-navigate the tab (save-host use)", async () => {
    const { api, createCount } = createTabs([
      { id: 7, url: `${MANAGER_URL}?task=task-2`, active: false },
    ]);
    const coordinator = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });

    const tabId = await coordinator.ensureOpen();

    expect(tabId).toBe(7);
    expect(createCount()).toBe(0);
    expect(api.update).not.toHaveBeenCalled();
  });

  it("finds the tab again after a service-worker restart lost the tab id", async () => {
    const { api, createCount } = createTabs([
      { id: 7, url: MANAGER_URL, active: true },
    ]);
    const first = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });
    await first.ensureOpen();

    // New worker instance, no memory of the old tab id.
    const second = createManagerTabCoordinator({
      tabs: api,
      managerUrl: MANAGER_URL,
    });
    const tabId = await second.ensureOpen();

    expect(tabId).toBe(7);
    expect(createCount()).toBe(0);
  });

  it("focus() brings an existing manager tab to the front, opening it when missing", async () => {
    const existing = createTabs([{ id: 7, url: MANAGER_URL, active: false }]);
    const withTab = createManagerTabCoordinator({
      tabs: existing.api,
      managerUrl: MANAGER_URL,
    });
    await withTab.focus();
    expect(existing.api.update).toHaveBeenCalledWith(7, { active: true });
    expect(existing.createCount()).toBe(0);

    const empty = createTabs();
    const withoutTab = createManagerTabCoordinator({
      tabs: empty.api,
      managerUrl: MANAGER_URL,
    });
    await withoutTab.focus();
    expect(empty.createCount()).toBe(1);
    expect(empty.api.update).toHaveBeenCalledWith(101, { active: true });
  });
});
