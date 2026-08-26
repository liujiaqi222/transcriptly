import type { Capture } from "@transcriptly/schema";
import { describe, expect, it, vi } from "vitest";
import { mountManagerLocalSaveHost } from "../entrypoints/manager/local-save-host";
import type { LocalMarkdownSaver } from "../local-save";

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

function createSaverStub(
  options: {
    directoryName?: string;
    permission?: PermissionState;
    requestResult?: PermissionState;
    saveResult?: { directoryName: string; filename: string };
    saveError?: Error;
    revokeDuringSave?: boolean;
    pickedDirectory?: string;
  } = {},
): LocalMarkdownSaver {
  let permission = options.permission ?? "granted";
  return {
    changeDirectory: vi.fn(async () => {
      if (!options.pickedDirectory) {
        throw new Error("Folder selection was cancelled.");
      }
      return options.pickedDirectory;
    }),
    getSavedDirectoryName: vi.fn(async () => options.directoryName),
    hasWritePermission: vi.fn(async () => permission === "granted"),
    requestWritePermission: vi.fn(async () => {
      permission = options.requestResult ?? "granted";
      return permission === "granted";
    }),
    save: vi.fn(async () => {
      if (options.revokeDuringSave) permission = "prompt";
      if (options.saveError) throw options.saveError;
      return options.saveResult ?? { directoryName: "Vault", filename: "a.md" };
    }),
  };
}

function createHost(saver: LocalMarkdownSaver) {
  const listeners: Array<(message: unknown) => unknown> = [];
  const host = mountManagerLocalSaveHost({
    createSaver: async () => saver,
    addListener: (listener) => {
      listeners.push(listener);
    },
  });
  return {
    host,
    send: <T>(message: unknown): Promise<T> => {
      const answer = listeners
        .map((listener) => listener(message))
        .find(Boolean);
      return answer as Promise<T>;
    },
  };
}

describe("manager local save host (#59)", () => {
  it("answers a ping", async () => {
    const { host, send } = createHost(createSaverStub());
    const response = await send<{ ok: true }>({
      type: "transcriptly:manager-local-ping",
    });
    expect(response).toEqual({ ok: true });
    void host;
  });

  it("preflights a granted folder as ok", async () => {
    const { send } = createHost(
      createSaverStub({ directoryName: "Vault", permission: "granted" }),
    );

    await expect(
      send({ type: "transcriptly:manager-local-preflight" }),
    ).resolves.toEqual({ ok: true, directoryName: "Vault" });
  });

  it("preflights an expired grant as typed permission-required", async () => {
    const { send } = createHost(
      createSaverStub({ directoryName: "Vault", permission: "prompt" }),
    );

    await expect(
      send({ type: "transcriptly:manager-local-preflight" }),
    ).resolves.toEqual({
      ok: false,
      reason: "permission-required",
      directoryName: "Vault",
    });
  });

  it("preflights a missing folder as no-directory", async () => {
    const { send } = createHost(createSaverStub({ directoryName: undefined }));

    await expect(
      send({ type: "transcriptly:manager-local-preflight" }),
    ).resolves.toEqual({ ok: false, reason: "no-directory" });
  });

  it("saves when permission is granted", async () => {
    const { send } = createHost(
      createSaverStub({ directoryName: "Vault", permission: "granted" }),
    );

    await expect(
      send({ type: "transcriptly:manager-local-save", capture }),
    ).resolves.toEqual({
      ok: true,
      directoryName: "Vault",
      filename: "a.md",
    });
  });

  it("returns permission-required immediately instead of waiting for a click", async () => {
    const saver = createSaverStub({
      directoryName: "Vault",
      permission: "prompt",
    });
    const { send } = createHost(saver);

    await expect(
      send({ type: "transcriptly:manager-local-save", capture }),
    ).resolves.toEqual({
      ok: false,
      reason: "permission-required",
      directoryName: "Vault",
    });
    expect(saver.save).not.toHaveBeenCalled();
  });

  it("treats a grant revoked mid-save as permission-required (typed, not string-matched)", async () => {
    const { send } = createHost(
      createSaverStub({
        directoryName: "Vault",
        permission: "granted",
        revokeDuringSave: true,
        saveError: new Error("Could not write: something else"),
      }),
    );

    await expect(
      send({ type: "transcriptly:manager-local-save", capture }),
    ).resolves.toEqual({
      ok: false,
      reason: "permission-required",
      directoryName: "Vault",
    });
  });

  it("maps a genuine write failure as an error result", async () => {
    const { send } = createHost(
      createSaverStub({
        directoryName: "Vault",
        permission: "granted",
        saveError: new Error("disk full"),
      }),
    );

    await expect(
      send({ type: "transcriptly:manager-local-save", capture }),
    ).resolves.toEqual({ ok: false, reason: "error", message: "disk full" });
  });

  it("ignores messages meant for other listeners", () => {
    const { send } = createHost(createSaverStub());
    expect(send({ type: "transcriptly:batch-status-request" })).toBeUndefined();
  });

  it("grants access through the permission prompt and publishes the new status", async () => {
    const saver = createSaverStub({
      directoryName: "Vault",
      permission: "prompt",
      requestResult: "granted",
    });
    const { host } = createHost(saver);

    await expect(host.grantAccess()).resolves.toBe("granted");
    expect(saver.requestWritePermission).toHaveBeenCalledWith();
    expect(host.getStatus()).toEqual({
      directoryName: "Vault",
      writePermission: true,
    });
  });

  it("reports a denied grant", async () => {
    const saver = createSaverStub({
      directoryName: "Vault",
      permission: "prompt",
      requestResult: "denied",
    });
    const { host } = createHost(saver);

    await expect(host.grantAccess()).resolves.toBe("denied");
    expect(host.getStatus()).toEqual({
      directoryName: "Vault",
      writePermission: false,
    });
  });

  it("picks a folder when none is selected during a grant", async () => {
    const saver = createSaverStub({
      directoryName: undefined,
      pickedDirectory: "Vault",
    });
    const { host } = createHost(saver);

    await expect(host.grantAccess()).resolves.toBe("granted");
    expect(saver.changeDirectory).toHaveBeenCalled();
    expect(host.getStatus().directoryName).toBe("Vault");
  });

  it("notifies subscribers when the status changes", async () => {
    const saver = createSaverStub({
      directoryName: "Vault",
      permission: "prompt",
      requestResult: "granted",
    });
    const { host, send } = createHost(saver);
    const listener = vi.fn();
    host.subscribe(listener);

    await send({ type: "transcriptly:manager-local-preflight" });
    expect(listener).toHaveBeenCalled();
    expect(host.getStatus().writePermission).toBe(false);
  });

  it("returns a stable status reference for useSyncExternalStore", () => {
    const { host } = createHost(createSaverStub({ directoryName: "Vault" }));
    expect(host.getStatus()).toBe(host.getStatus());
  });
});
