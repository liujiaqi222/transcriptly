import type { MarkdownFormat } from "@transcriptly/capture";
import {
  MARKDOWN_FORMAT_PREFERENCE_KEY,
  normalizeMarkdownFormat,
} from "@/markdown-format";

/** Popup and Batch Manager intentionally share these installation preferences. */
export const PUBLIC_CONTRIBUTION_PREFERENCE_KEY = "cloud-save-enabled";

export interface SavePreferenceStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export interface SavePreferences {
  getMarkdownFormat(): Promise<MarkdownFormat>;
  setMarkdownFormat(format: MarkdownFormat): Promise<void>;
  getPublicContributionEnabled(): Promise<boolean>;
  setPublicContributionEnabled(enabled: boolean): Promise<void>;
}

/** One source of truth for save choices used by every extension surface. */
export function createSavePreferences(
  storage: SavePreferenceStorage,
): SavePreferences {
  return {
    async getMarkdownFormat() {
      const stored = await storage.get([MARKDOWN_FORMAT_PREFERENCE_KEY]);
      return normalizeMarkdownFormat(stored[MARKDOWN_FORMAT_PREFERENCE_KEY]);
    },
    async setMarkdownFormat(format) {
      await storage.set({ [MARKDOWN_FORMAT_PREFERENCE_KEY]: format });
    },
    async getPublicContributionEnabled() {
      const stored = await storage.get([PUBLIC_CONTRIBUTION_PREFERENCE_KEY]);
      return stored[PUBLIC_CONTRIBUTION_PREFERENCE_KEY] === true;
    },
    async setPublicContributionEnabled(enabled) {
      await storage.set({ [PUBLIC_CONTRIBUTION_PREFERENCE_KEY]: enabled });
    },
  };
}
