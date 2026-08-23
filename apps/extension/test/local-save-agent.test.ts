import type { Capture } from "@transcriptly/schema";
import { describe, expect, it, vi } from "vitest";
import { createSaveAgentClient } from "../batch/local-save-agent";
import { SAVE_AGENT_PING, SAVE_AGENT_SAVE } from "../shared/messages";

const capture: Capture = {
  source: {
    videoId: "abc12345678",
    url: "https://www.youtube.com/watch?v=abc12345678",
    title: "First video",
    channelName: "Ship It Weekly",
    channelUrl: "https://www.youtube.com/@shipitweekly",
    description: "",
  },
  capturedAt: "2026-08-22T00:00:00.000Z",
  segments: [{ start: 0, text: "Hello" }],
};

function createTabs(
  options: { readyAfterCreate?: number; saveResponse?: unknown } = {},
) {
  let created = 0;
  let pings = 0;
  const create = vi.fn(async () => {
    created += 1;
    return { id: 100 + created };
  });
  const sendMessage = vi.fn(
    async <T>(_tabId: number, message: unknown): Promise<T> => {
      if ((message as { type: string }).type === SAVE_AGENT_PING) {
        pings += 1;
        if (pings <= (options.readyAfterCreate ?? 0)) {
          throw new Error("Receiving end does not exist");
        }
        return { ok: true } as T;
      }
      if ((message as { type: string }).type === SAVE_AGENT_SAVE) {
        return (options.saveResponse ?? {
          ok: true,
          directoryName: "Vault",
          filename: "a.md",
        }) as T;
      }
      throw new Error("unexpected message");
    },
  );
  const tabs = {
    create,
    sendMessage,
  } as unknown as import("../batch/local-save-agent").AgentTabsApi;
  return { tabs, sendMessage, createCount: () => created };
}

function fastClock() {
  let clock = 1_000;
  return {
    now: () => clock,
    delay: async (ms: number) => {
      clock += ms;
    },
  };
}

describe("save agent client", () => {
  it("opens the page once and reuses it for later saves", async () => {
    const { tabs, createCount } = createTabs();
    const client = createSaveAgentClient({
      tabs,
      agentUrl: "chrome-extension://abc/save-agent.html",
      ...fastClock(),
    });

    const first = await client.save(capture);
    const second = await client.save(capture);

    expect(first).toEqual({ directoryName: "Vault", filename: "a.md" });
    expect(second).toEqual({ directoryName: "Vault", filename: "a.md" });
    expect(createCount()).toBe(1);
    expect(tabs.create).toHaveBeenCalledWith(
      "chrome-extension://abc/save-agent.html",
    );
  });

  it("maps the agent's failure message", async () => {
    const { tabs } = createTabs({
      saveResponse: { ok: false, message: "Write access was not granted." },
    });
    const client = createSaveAgentClient({
      tabs,
      agentUrl: "chrome-extension://abc/save-agent.html",
      ...fastClock(),
    });

    await expect(client.save(capture)).rejects.toThrow(
      "Write access was not granted.",
    );
  });

  it("carries a receipt index warning without failing the save", async () => {
    const { tabs } = createTabs({
      saveResponse: {
        ok: true,
        directoryName: "Vault",
        filename: "a.md",
        receiptError: "index failed",
      },
    });
    const client = createSaveAgentClient({
      tabs,
      agentUrl: "chrome-extension://abc/save-agent.html",
      ...fastClock(),
    });

    const result = await client.save(capture);
    expect(result.receiptError).toBe("index failed");
  });

  it("reopens the page when the tab was closed", async () => {
    const { tabs, sendMessage, createCount } = createTabs();
    const client = createSaveAgentClient({
      tabs,
      agentUrl: "chrome-extension://abc/save-agent.html",
      ...fastClock(),
    });
    await client.save(capture);

    // Simulate the agent tab dying: pings start failing again.
    sendMessage.mockImplementation(async () => {
      throw new Error("Receiving end does not exist");
    });
    await expect(client.save(capture)).rejects.toThrow("did not open in time");
    expect(createCount()).toBe(2);
  });

  it("fails with a clear message when the agent never becomes ready", async () => {
    const { tabs } = createTabs({ readyAfterCreate: Number.MAX_SAFE_INTEGER });
    const client = createSaveAgentClient({
      tabs,
      agentUrl: "chrome-extension://abc/save-agent.html",
      ...fastClock(),
    });

    await expect(client.save(capture)).rejects.toThrow("did not open in time");
  });
});
