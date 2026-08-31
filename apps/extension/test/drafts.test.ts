import { describe, expect, it } from "vitest";
import {
  type BatchDraftStorage,
  createBatchDraftStore,
  DRAFT_TTL_MS,
} from "../batch/drafts";
import type { BatchVideo } from "../batch/jobs";

const video: BatchVideo = {
  videoId: "abc12345678",
  url: "https://www.youtube.com/watch?v=abc12345678",
  title: "Draft video",
};

function createStorage(): BatchDraftStorage & {
  keysSeen: () => string[];
} {
  const records = new Map<string, unknown>();
  return {
    keys: async () => [...records.keys()],
    get: async (key) => records.get(key),
    set: async (key, value) => {
      records.set(key, value);
    },
    remove: async (key) => {
      records.delete(key);
    },
    keysSeen: () => [...records.keys()],
  };
}

describe("batch draft store (#102)", () => {
  it("creates, reads and deletes a draft", async () => {
    const storage = createStorage();
    const store = createBatchDraftStore(storage, {
      newId: () => "draft-1",
      now: () => 1_000,
    });

    const draft = await store.create([video]);
    expect(draft).toEqual({ id: "draft-1", videos: [video], createdAt: 1_000 });
    expect(await store.get("draft-1")).toEqual(draft);

    await store.delete("draft-1");
    expect(await store.get("draft-1")).toBeUndefined();
    expect(storage.keysSeen()).toEqual([]);
  });

  it("rejects an empty selection", async () => {
    const store = createBatchDraftStore(createStorage());
    await expect(store.create([])).rejects.toThrow(/at least one video/i);
  });

  it("ignores storage keys outside the draft namespace", async () => {
    const storage = createStorage();
    await storage.set("transcriptly:other:key", { createdAt: 0 });
    const store = createBatchDraftStore(storage, {
      newId: () => "draft-1",
      now: () => DRAFT_TTL_MS * 2,
    });

    await store.create([video]);

    expect(storage.keysSeen()).toEqual([
      "transcriptly:other:key",
      "transcriptly:batch-draft:draft-1",
    ]);
  });

  it("sweeps drafts older than the TTL when a new selection arrives", async () => {
    const storage = createStorage();
    let now = 0;
    let nextId = 0;
    const store = createBatchDraftStore(storage, {
      newId: () => `draft-${++nextId}`,
      now: () => now,
    });

    const stale = await store.create([video]);
    // Jump past the TTL: the next create sweeps the stale draft but keeps
    // drafts that are still fresh.
    now = DRAFT_TTL_MS + 1;
    const fresh = await store.create([video]);
    now += 1_000;
    const newest = await store.create([video]);

    expect(await store.get(stale.id)).toBeUndefined();
    expect(await store.get(fresh.id)).toEqual(fresh);
    expect(await store.get(newest.id)).toEqual(newest);
  });

  it("sweeps expired drafts on demand and reports the removed ids", async () => {
    const storage = createStorage();
    let now = 1_000;
    let nextId = 0;
    const store = createBatchDraftStore(storage, {
      newId: () => `draft-${++nextId}`,
      now: () => now,
    });

    const stale = await store.create([video]);
    now += DRAFT_TTL_MS + 1;

    expect(await store.sweepExpired()).toEqual([stale.id]);
    expect(await store.sweepExpired()).toEqual([]);
  });
});
