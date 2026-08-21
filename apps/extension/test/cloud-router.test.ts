import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudClient } from "../cloud/client";
import { createCloudJobStore } from "../cloud/jobs";
import { createCloudUploadQueue } from "../cloud/queue";
import { createCloudMessageRouter } from "../cloud/router";

const capture: Capture = {
  source: {
    videoId: "abc12345678",
    url: "https://www.youtube.com/watch?v=abc12345678",
    title: "Ship It",
    channelName: "Ship It Weekly",
    channelUrl: "https://www.youtube.com/@shipitweekly",
    description: "An episode.",
  },
  capturedAt: "2026-08-20T10:30:00.000Z",
  segments: [{ start: 0, text: "Hello." }],
};

describe("cloud message router", () => {
  let getSession: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;
  let uploadCapture: ReturnType<typeof vi.fn>;
  let router: ReturnType<typeof createCloudMessageRouter>;

  beforeEach(() => {
    getSession = vi.fn(async () => ({ status: "signed-out" as const }));
    signOut = vi.fn(async () => ({ status: "signed-out" as const }));
    uploadCapture = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              libraryItemId: "item-1",
              videoId: "abc12345678",
              outcome: "created",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const client = {
      getSession,
      signOut,
      uploadCapture,
    } as unknown as CloudClient;
    const store = createCloudJobStore({ indexedDB: new IDBFactory() });
    const queue = createCloudUploadQueue({ store, client });
    router = createCloudMessageRouter({ client, queue });
  });

  it("passes session requests through to the client", async () => {
    getSession.mockResolvedValue({ status: "signed-in", email: "u@x.test" });

    await expect(
      router.handle({ type: "transcriptly:cloud-session-request" }),
    ).resolves.toEqual({ status: "signed-in", email: "u@x.test" });
  });

  it("clears every cloud job when the shared session is signed out", async () => {
    await router.handle({
      type: "transcriptly:cloud-save-enqueue",
      capture,
    });
    await vi.waitFor(async () => {
      const snapshot = await router.handle({
        type: "transcriptly:cloud-snapshot-request",
        videoId: "abc12345678",
      });
      if (snapshot && "current" in snapshot && !snapshot.current) {
        throw new Error("not uploaded yet");
      }
    });

    await expect(
      router.handle({ type: "transcriptly:cloud-sign-out-request" }),
    ).resolves.toEqual({ status: "signed-out" });

    const snapshot = await router.handle({
      type: "transcriptly:cloud-snapshot-request",
      videoId: "abc12345678",
    });
    expect(snapshot).toEqual({ failed: [] });
  });

  it("queues a cloud save and reports the job id", async () => {
    const result = await router.handle({
      type: "transcriptly:cloud-save-enqueue",
      capture,
    });

    expect(result).toEqual({ ok: true, jobId: expect.any(String) });
    await vi.waitFor(() => expect(uploadCapture).toHaveBeenCalledWith(capture));
  });

  it("reports enqueue failures without throwing", async () => {
    const failingQueue = {
      enqueue: vi.fn(async () => {
        throw new Error("IndexedDB is broken");
      }),
    };
    const failingRouter = createCloudMessageRouter({
      client: { getSession, signOut } as unknown as CloudClient,
      queue: failingQueue as never,
    });

    const result = await failingRouter.handle({
      type: "transcriptly:cloud-save-enqueue",
      capture,
    });

    expect(result).toEqual({
      ok: false,
      message: "Could not queue the cloud save: IndexedDB is broken",
    });
  });

  it("retries a failed job on request", async () => {
    uploadCapture
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: {
                code: "unauthenticated",
                message: "No session.",
                retryable: false,
                requestId: "r",
              },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
      )
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              data: {
                libraryItemId: "item-1",
                videoId: "abc12345678",
                outcome: "unchanged",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      );

    const enqueued = await router.handle({
      type: "transcriptly:cloud-save-enqueue",
      capture,
    });
    await vi.waitFor(async () => {
      const snapshot = await router.handle({
        type: "transcriptly:cloud-snapshot-request",
        videoId: "abc12345678",
      });
      if (snapshot && "failed" in snapshot && snapshot.failed.length === 0) {
        throw new Error("not failed yet");
      }
    });

    const retried = await router.handle({
      type: "transcriptly:cloud-job-retry",
      jobId: (enqueued as { jobId: string }).jobId,
    });
    expect(retried).toEqual({ ok: true });

    await vi.waitFor(async () => {
      const snapshot = await router.handle({
        type: "transcriptly:cloud-snapshot-request",
        videoId: "abc12345678",
      });
      if (
        !snapshot ||
        !("current" in snapshot) ||
        snapshot.current?.state !== "saved"
      ) {
        throw new Error("not saved yet");
      }
    });
    expect(uploadCapture).toHaveBeenCalledTimes(2);
  });

  it("reports a retry for a job that no longer exists", async () => {
    const result = await router.handle({
      type: "transcriptly:cloud-job-retry",
      jobId: "missing",
    });
    expect(result && "ok" in result && result.ok === false).toBe(true);
  });

  it("ignores unknown message types", async () => {
    await expect(
      router.handle({ type: "transcriptly:capture-request" } as never),
    ).resolves.toBeUndefined();
  });
});
