import { describe, expect, it } from "vitest";
import { parsePageParam } from "./pagination";

describe("parsePageParam", () => {
  it("defaults to the first page and accepts positive safe integers", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("24")).toBe(24);
  });

  it.each(["", "0", "-1", "1.5", "abc", "999999999999999999999"])(
    "rejects invalid or unsafe page %s",
    (raw) => {
      expect(parsePageParam(raw)).toBeNull();
    },
  );
});
