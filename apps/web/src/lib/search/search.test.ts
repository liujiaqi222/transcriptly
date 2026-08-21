import { describe, expect, it } from "vitest";
import { escapeLike, MAX_SEARCH_QUERY_LENGTH, normalizeQuery } from "./search";

describe("normalizeQuery", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeQuery("  hello  ")).toBe("hello");
    expect(normalizeQuery("\t名词\n")).toBe("名词");
  });

  it("returns null for empty or whitespace-only queries", () => {
    expect(normalizeQuery("")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery("\n\t")).toBeNull();
  });

  it("truncates over-long queries to the configured bound", () => {
    const long = "a".repeat(MAX_SEARCH_QUERY_LENGTH + 50);
    expect(normalizeQuery(long)).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE metacharacters so the query stays a literal substring", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLike("hello world")).toBe("hello world");
    expect(escapeLike("名词检索")).toBe("名词检索");
  });
});
