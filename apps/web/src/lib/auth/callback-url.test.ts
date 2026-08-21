import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("keeps same-site relative paths", () => {
    expect(safeCallbackUrl("/saved")).toBe("/saved");
    expect(safeCallbackUrl("/saved?page=2")).toBe("/saved?page=2");
    expect(safeCallbackUrl("/saved/waGRF_ZApfI")).toBe("/saved/waGRF_ZApfI");
  });

  it("falls back to the saved list for missing or unsafe values", () => {
    expect(safeCallbackUrl(undefined)).toBe("/saved");
    expect(safeCallbackUrl(null)).toBe("/saved");
    expect(safeCallbackUrl("")).toBe("/saved");
    expect(safeCallbackUrl("https://evil.example/phish")).toBe("/saved");
    expect(safeCallbackUrl("//evil.example")).toBe("/saved");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/saved");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/saved");
  });
});
