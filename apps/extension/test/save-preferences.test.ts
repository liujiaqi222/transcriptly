import { describe, expect, it } from "vitest";
import { MARKDOWN_FORMAT_PREFERENCE_KEY } from "../markdown-format";
import {
  createSavePreferences,
  PUBLIC_CONTRIBUTION_PREFERENCE_KEY,
} from "../save-preferences";

describe("shared save preferences", () => {
  it("persists Markdown format and Public archive in one storage source", async () => {
    const values: Record<string, unknown> = {};
    const preferences = createSavePreferences({
      async get(keys) {
        return Object.fromEntries(keys.map((key) => [key, values[key]]));
      },
      async set(next) {
        Object.assign(values, next);
      },
    });

    await preferences.setMarkdownFormat("article");
    await preferences.setPublicContributionEnabled(true);

    expect(values).toEqual({
      [MARKDOWN_FORMAT_PREFERENCE_KEY]: "article",
      [PUBLIC_CONTRIBUTION_PREFERENCE_KEY]: true,
    });
    await expect(preferences.getMarkdownFormat()).resolves.toBe("article");
    await expect(preferences.getPublicContributionEnabled()).resolves.toBe(
      true,
    );
  });
});
