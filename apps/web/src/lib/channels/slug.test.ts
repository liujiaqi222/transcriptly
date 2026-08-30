import { describe, expect, it } from "vitest";
import { channelSlug } from "./slug";

describe("channelSlug", () => {
  it("keeps the common handle route readable", () => {
    expect(channelSlug("/@veritasium")).toBe("veritasium");
    expect(channelSlug("/channel/UC123")).toBe("channel-UC123");
  });

  it("preserves dots, underscores, hyphens, and case", () => {
    expect(channelSlug("/@a.b")).toBe("a.b");
    expect(channelSlug("/@a_b")).toBe("a_b");
    expect(channelSlug("/@a-b")).toBe("a-b");
    expect(channelSlug("/@MixedCase")).toBe("MixedCase");
  });
});
