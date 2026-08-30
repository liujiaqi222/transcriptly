import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("keeps same-site relative paths", () => {
    expect(safeCallbackUrl("/transcripts/waGRF_ZApfI")).toBe(
      "/transcripts/waGRF_ZApfI",
    );
    expect(safeCallbackUrl("/?q=agents")).toBe("/?q=agents");
  });

  it("falls back to the home page for missing or unsafe values", () => {
    expect(safeCallbackUrl(undefined)).toBe("/");
    expect(safeCallbackUrl(null)).toBe("/");
    expect(safeCallbackUrl("")).toBe("/");
    expect(safeCallbackUrl("https://evil.example/phish")).toBe("/");
    expect(safeCallbackUrl("//evil.example")).toBe("/");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/");
  });
});
