import type { Capture } from "@transcriptly/schema";
import { describe, expect, it, vi } from "vitest";
import { createLocalSaveClient } from "../batch/local-save-client";
import {
  MANAGER_LOCAL_PING,
  MANAGER_LOCAL_PREFLIGHT,
  MANAGER_LOCAL_SAVE,
} from "../shared/messages";

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

function fastClock() {
  let clock = 1_000;
  return {
    now: () => clock,
    delay: async (ms: number) => {
      clock += ms;
    },
  };
}

function createHarness(
  options: {
    /** Number of failed pings before the manager page answers. */
    readyAfterCreate?: number;
    preflightResponse?: unknown;
    saveResponse?: unknown;
    existingTab?: number;
  } = {},
) {
  let pings = 0;
  let created = 0;
  const saveResponse = options.saveResponse;
  const sendMessage = vi.fn(
    async <T>(_tabId: number, message: unknown): Promise<T> => {
      const type = (message as { type: string }).type;
      if (type === MANAGER_LOCAL_PING) {
        pings += 1;
        if (pings <= (options.readyAfterCreate ?? 0)) {
          throw new Error("Receiving end does not exist");
        }
        return { ok: true } as T;
      }
      if (type === MANAGER_LOCAL_PREFLIGHT) {
        if (options.preflightResponse === undefined) {
          throw new Error("unexpected preflight");
        }
        return options.preflightResponse as T;
      }
      if (type === MANAGER_LOCAL_SAVE) {
        if (saveResponse === undefined) {
          throw new Error("unexpected save");
        }
        return saveResponse as T;
      }
      throw new Error("unexpected message");
    },
  );
  const ensureOpen = vi.fn(async () => {
    created += 1;
    return 100 + created;
  });
  const focus = vi.fn(async () => undefined);
  const client = createLocalSaveClient({
    managerTabs: { ensureOpen, focus },
    tabs: { sendMessage } as unknown as {
      sendMessage<T>(tabId: number, message: unknown): Promise<T>;
    },
    ...fastClock(),
  });
  return { client, sendMessage, ensureOpen, focus };
}

describe("local save client (#59)", () => {
  it("returns a granted preflight as a typed ok outcome", async () => {
    const { client } = createHarness({
      preflightResponse: { ok: true, directoryName: "Vault" },
    });

    await expect(client.preflight()).resolves.toEqual({
      status: "ok",
      directoryName: "Vault",
    });
  });

  it("maps a permission-required preflight without any waiting and focuses the manager", async () => {
    const { client, focus } = createHarness({
      preflightResponse: {
        ok: false,
        reason: "permission-required",
        directoryName: "Vault",
      },
    });

    await expect(client.preflight()).resolves.toEqual({
      status: "permission-required",
    });
    expect(focus).toHaveBeenCalled();
  });

  it("maps a no-directory preflight", async () => {
    const { client } = createHarness({
      preflightResponse: { ok: false, reason: "no-directory" },
    });

    await expect(client.preflight()).resolves.toEqual({
      status: "no-directory",
    });
  });

  it("maps a host preflight error to unavailable", async () => {
    const { client } = createHarness({
      preflightResponse: { ok: false, reason: "error", message: "boom" },
    });

    await expect(client.preflight()).resolves.toEqual({
      status: "unavailable",
      message: "boom",
    });
  });

  it("returns an unavailable preflight when the manager page never responds", async () => {
    const { client } = createHarness({
      readyAfterCreate: Number.MAX_SAFE_INTEGER,
    });

    const outcome = await client.preflight();
    expect(outcome).toMatchObject({ status: "unavailable" });
  });

  it("returns a saved outcome with the host's result", async () => {
    const { client } = createHarness({
      saveResponse: {
        ok: true,
        directoryName: "Vault",
        filename: "a.md",
        receiptError: "index failed",
      },
    });

    await expect(client.save(capture)).resolves.toEqual({
      status: "saved",
      result: {
        directoryName: "Vault",
        filename: "a.md",
        receiptError: "index failed",
      },
    });
  });

  it("maps a permission-required save answer immediately (no user wait)", async () => {
    const { client, focus } = createHarness({
      saveResponse: {
        ok: false,
        reason: "permission-required",
        directoryName: "Vault",
      },
    });

    await expect(client.save(capture)).resolves.toEqual({
      status: "permission-required",
    });
    expect(focus).toHaveBeenCalled();
  });

  it("maps a no-directory save answer to permission-required", async () => {
    const { client } = createHarness({
      saveResponse: { ok: false, reason: "no-directory" },
    });

    await expect(client.save(capture)).resolves.toEqual({
      status: "permission-required",
    });
  });

  it("maps a plain host save error to a per-item error outcome", async () => {
    const { client } = createHarness({
      saveResponse: { ok: false, reason: "error", message: "disk full" },
    });

    await expect(client.save(capture)).resolves.toEqual({
      status: "error",
      message: "disk full",
    });
  });

  it("times out a hung save at the outermost deadline with an unavailable outcome", async () => {
    const sendMessage = vi.fn(async <T>(_tabId: number, message: unknown) => {
      const type = (message as { type: string }).type;
      if (type === MANAGER_LOCAL_PING) return { ok: true } as T;
      if (type === MANAGER_LOCAL_SAVE) {
        // The host never answers (page hung mid-write).
        await new Promise(() => {});
        throw new Error("unreachable");
      }
      throw new Error("unexpected message");
    });
    const client = createLocalSaveClient({
      managerTabs: {
        ensureOpen: async () => 101,
        focus: async () => undefined,
      },
      tabs: {
        sendMessage,
      } as unknown as {
        sendMessage<T>(tabId: number, message: unknown): Promise<T>;
      },
      // Deadline timers fire immediately: the test asserts the mapping,
      // not the wall-clock duration.
      timers: {
        setTimeout: (callback: () => void) => setTimeout(callback, 0),
        clearTimeout: (handle: unknown) =>
          clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      ...fastClock(),
    });

    const outcome = await client.save(capture);
    expect(outcome.status).toBe("unavailable");
    if (outcome.status === "unavailable") {
      expect(outcome.message).toContain("Check the target folder");
    }
  });

  it("returns unavailable when the manager tab cannot be reopened at all", async () => {
    let pings = 0;
    const client = createLocalSaveClient({
      managerTabs: {
        ensureOpen: async () => 101,
        focus: async () => undefined,
      },
      tabs: {
        sendMessage: async () => {
          pings += 1;
          throw new Error("Receiving end does not exist");
        },
      },
      ...fastClock(),
    });

    const outcome = await client.preflight();
    expect(outcome.status).toBe("unavailable");
    expect(pings).toBeGreaterThan(0);
  });
});
