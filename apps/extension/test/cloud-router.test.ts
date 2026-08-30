import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudClient } from "../cloud/client";
import { createCloudJobStore } from "../cloud/jobs";
import { createCloudUploadQueue } from "../cloud/queue";
import { createCloudMessageRouter } from "../cloud/router";
import {
  CLOUD_JOB_RETRY,
  CLOUD_QUEUE_STATUS_REQUEST,
  CLOUD_SAVE_ENQUEUE,
  CLOUD_SESSION_REQUEST,
  CLOUD_SIGN_OUT_REQUEST,
} from "../shared/messages";

const capture: Capture = {
  source: {
    videoId: "abc12345678",
    url: "https://www.youtube.com/watch?v=abc12345678",
    title: "Ship It",
    channelName: "Ship It Weekly",
    channelHandle: "/@shipitweekly",
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
              contributionId: "contribution-1",
              videoId: "abc12345678",
              outcome: "published",
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
      router.handle({ type: CLOUD_SESSION_REQUEST }),
    ).resolves.toEqual({ status: "signed-in", email: "u@x.test" });
  });

  it("clears every cloud job when the shared session is signed out", async () => {
    await router.handle({
      type: CLOUD_SAVE_ENQUEUE,
      capture,
    });
    await vi.waitFor(async () => {
      const queueStatus = await router.handle({
        type: CLOUD_QUEUE_STATUS_REQUEST,
        videoId: "abc12345678",
      });
      if (queueStatus && "current" in queueStatus && !queueStatus.current) {
        throw new Error("not uploaded yet");
      }
    });

    await expect(
      router.handle({ type: CLOUD_SIGN_OUT_REQUEST }),
    ).resolves.toEqual({ status: "signed-out" });

    const queueStatus = await router.handle({
      type: CLOUD_QUEUE_STATUS_REQUEST,
      videoId: "abc12345678",
    });
    expect(queueStatus).toEqual({ failed: [] });
  });

  it("queues a cloud save and reports the job id", async () => {
    const result = await router.handle({
      type: CLOUD_SAVE_ENQUEUE,
      capture,
    });

    expect(result).toEqual({ ok: true, jobId: expect.any(String) });
    await vi.waitFor(() => expect(uploadCapture).toHaveBeenCalledWith(capture));
  });

  it("records a failed post-sign-out cleanup without changing sign-out success", async () => {
    const clearAll = vi.fn(async () => {
      throw new Error("IndexedDB is unavailable");
    });
    const failingRouter = createCloudMessageRouter({
      client: { getSession, signOut } as unknown as CloudClient,
      queue: { clearAll } as never,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      failingRouter.handle({ type: CLOUD_SIGN_OUT_REQUEST }),
    ).resolves.toEqual({ status: "signed-out" });

    expect(clearAll).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "Could not clear cloud jobs after sign-out; retry on the next sign-out.",
      expect.any(Error),
    );
    consoleError.mockRestore();
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
      type: CLOUD_SAVE_ENQUEUE,
      capture,
    });

    expect(result).toEqual({
      ok: false,
      message: "Could not queue the public contribution: IndexedDB is broken",
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
                contributionId: "contribution-1",
                videoId: "abc12345678",
                outcome: "unchanged",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      );

    const enqueued = await router.handle({
      type: CLOUD_SAVE_ENQUEUE,
      capture,
    });
    await vi.waitFor(async () => {
      const queueStatus = await router.handle({
        type: CLOUD_QUEUE_STATUS_REQUEST,
        videoId: "abc12345678",
      });
      if (
        queueStatus &&
        "failed" in queueStatus &&
        queueStatus.failed.length === 0
      ) {
        throw new Error("not failed yet");
      }
    });

    const retried = await router.handle({
      type: CLOUD_JOB_RETRY,
      jobId: (enqueued as { jobId: string }).jobId,
    });
    expect(retried).toEqual({ ok: true });

    await vi.waitFor(async () => {
      const queueStatus = await router.handle({
        type: CLOUD_QUEUE_STATUS_REQUEST,
        videoId: "abc12345678",
      });
      if (
        !queueStatus ||
        !("current" in queueStatus) ||
        queueStatus.current?.state !== "saved"
      ) {
        throw new Error("not saved yet");
      }
    });
    expect(uploadCapture).toHaveBeenCalledTimes(2);
  });

  it("reports a retry for a job that no longer exists", async () => {
    const result = await router.handle({
      type: CLOUD_JOB_RETRY,
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
