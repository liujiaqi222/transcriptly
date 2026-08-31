import type { BatchVideo } from "@/batch/jobs";

const DRAFT_PREFIX = "transcriptly:batch-draft:";

/**
 * Selection drafts a user never starts or cancels (closed the manager tab,
 * abandoned setup) are swept once older than a day, so storage does not
 * accumulate abandoned video lists forever.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface BatchDraft {
  id: string;
  videos: BatchVideo[];
  createdAt: number;
}

export interface BatchDraftStore {
  create(videos: BatchVideo[]): Promise<BatchDraft>;
  get(id: string): Promise<BatchDraft | undefined>;
  delete(id: string): Promise<void>;
  /** Remove drafts older than the TTL; returns the removed draft ids. */
  sweepExpired(): Promise<string[]>;
}

export interface BatchDraftStorage {
  keys(): Promise<string[]>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

function key(id: string): string {
  return `${DRAFT_PREFIX}${id}`;
}

export function createBatchDraftStore(
  storage: BatchDraftStorage,
  options: { newId?: () => string; now?: () => number } = {},
): BatchDraftStore {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now;

  async function read(storageKey: string): Promise<BatchDraft | undefined> {
    return (await storage.get(storageKey)) as BatchDraft | undefined;
  }

  async function sweepExpired(): Promise<string[]> {
    const cutoff = now() - DRAFT_TTL_MS;
    const removed: string[] = [];
    for (const storageKey of await storage.keys()) {
      if (!storageKey.startsWith(DRAFT_PREFIX)) continue;
      const draft = await read(storageKey);
      if (draft && draft.createdAt < cutoff) {
        await storage.remove(storageKey);
        removed.push(draft.id);
      }
    }
    return removed;
  }

  return {
    async create(videos) {
      if (videos.length === 0) throw new Error("Select at least one video.");
      await sweepExpired();
      const draft: BatchDraft = { id: newId(), videos, createdAt: now() };
      await storage.set(key(draft.id), draft);
      return draft;
    },
    get: (id) => read(key(id)),
    delete(id) {
      return storage.remove(key(id));
    },
    sweepExpired,
  };
}
