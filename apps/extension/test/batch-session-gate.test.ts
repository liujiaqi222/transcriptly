import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { type BatchVideo, createBatchJobStore } from "../batch/jobs";
import {
  BATCH_SESSION_KEY,
  type BatchSessionStorage,
  createBatchSessionGate,
} from "../batch/session-gate";

const videos: BatchVideo[] = [
  {
    videoId: "abc12345678",
    url: "https://www.youtube.com/watch?v=abc12345678",
    title: "First video",
  },
  {
    videoId: "def12345678",
    url: "https://www.youtube.com/watch?v=def12345678",
    title: "Second video",
  },
];

function createStorage(initial = false): BatchSessionStorage & {
  raw: Map<string, unknown>;
} {
  const raw = new Map<string, unknown>([
    [BATCH_SESSION_KEY, initial ? true : undefined],
  ]);
  return {
    raw,
    async get(key) {
      return raw.get(key);
    },
    async set(key, value) {
      raw.set(key, value);
    },
  };
}

async function createHarness(storage: BatchSessionStorage) {
  const store = createBatchJobStore({
    indexedDB: new IDBFactory(),
    newId: () => `task-${Math.random().toString(36).slice(2, 8)}`,
  });
  const gate = createBatchSessionGate({ store, storage, now: () => 42_000 });
  return { store, gate };
}

describe("browser session gate (#59)", () => {
  it("pauses unfinished tasks after a browser restart and re-queues running destinations", async () => {
    const { store, gate } = await createHarness(createStorage());
    const task = await store.create(videos, {
      destinations: ["local", "cloud"],
    });
    task.state = "running";
    const interrupted = task.items[0];
    if (!interrupted) throw new Error("missing item");
    interrupted.local = "running";
    interrupted.cloud = "saved";
    await store.put(task);

    const kind = await gate.ensureSession();

    expect(kind).toBe("browser-restart");
    const paused = await store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("browser-restart");
    expect(paused?.items[0]).toMatchObject({ local: "queued", cloud: "saved" });
    expect(paused?.items[1]).toMatchObject({
      local: "queued",
      cloud: "queued",
    });
  });

  it("leaves finished and already-paused tasks alone", async () => {
    const { store, gate } = await createHarness(createStorage());
    const completed = await store.create(videos.slice(0, 1), {
      destinations: ["local"],
    });
    completed.state = "completed";
    await store.put(completed);
    const userPaused = await store.create(videos.slice(0, 1), {
      destinations: ["local"],
    });
    userPaused.state = "paused";
    userPaused.pauseReason = "user";
    await store.put(userPaused);

    await gate.ensureSession();

    expect((await store.get(completed.id))?.state).toBe("completed");
    const stillPaused = await store.get(userPaused.id);
    expect(stillPaused?.pauseReason).toBe("user");
  });

  it("reports the same session while the marker survives a worker restart", async () => {
    const storage = createStorage();
    const first = await createHarness(storage);
    await first.gate.ensureSession();

    // A new worker instance in the same browser session: storage.session
    // still holds the marker, so no task is touched.
    const secondStore = createBatchJobStore({
      indexedDB: new IDBFactory(),
      newId: () => "task-b",
    });
    const task = await secondStore.create(videos.slice(0, 1), {
      destinations: ["local"],
    });
    task.state = "running";
    await secondStore.put(task);
    const second = createBatchSessionGate({
      store: secondStore,
      storage,
      now: () => 42_000,
    });

    expect(await second.ensureSession()).toBe("same-session");
    const untouched = await secondStore.get(task.id);
    expect(untouched?.state).toBe("running");
    expect(untouched?.pauseReason).toBeUndefined();
  });

  it("classifies only once per worker instance", async () => {
    const storage = createStorage();
    const { gate } = await createHarness(storage);
    expect(await gate.ensureSession()).toBe("browser-restart");
    // The marker is set now; the same instance still remembers its own
    // classification instead of re-pausing.
    expect(await gate.ensureSession()).toBe("browser-restart");
    expect(storage.raw.get(BATCH_SESSION_KEY)).toBe(true);
  });

  it("pauses a queued task on a browser restart too", async () => {
    const { store, gate } = await createHarness(createStorage());
    const task = await store.create(videos.slice(0, 1), {
      destinations: ["cloud"],
    });

    await gate.ensureSession();

    const paused = await store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("browser-restart");
  });
});
