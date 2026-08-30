import { describe, expect, it } from "vitest";
import { isAllowedOrigin, parseOrigins } from "./origin-allowlist";

const websiteOrigin = "http://localhost:3000";
const extensionOrigin = "chrome-extension://jkopejjjgdkkacabdhgdlploehikphai";

describe("origin allowlist", () => {
  it("allows the website origin and the exact extension origin", () => {
    const allowed = [websiteOrigin, extensionOrigin];

    expect(isAllowedOrigin(websiteOrigin, allowed)).toBe(true);
    expect(isAllowedOrigin(extensionOrigin, allowed)).toBe(true);
  });

  it("rejects other extension ids and look-alike prefixes", () => {
    const allowed = [extensionOrigin];

    expect(isAllowedOrigin("chrome-extension://attackerid", allowed)).toBe(
      false,
    );
    expect(isAllowedOrigin(`${extensionOrigin}-evil`, allowed)).toBe(false);
    expect(isAllowedOrigin(`${extensionOrigin}/`, allowed)).toBe(false);
    expect(isAllowedOrigin("chrome-extension://", allowed)).toBe(false);
  });

  it("rejects missing origins and unknown websites", () => {
    const allowed = [websiteOrigin, extensionOrigin];

    expect(isAllowedOrigin(null, allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
    expect(isAllowedOrigin("", allowed)).toBe(false);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isAllowedOrigin(extensionOrigin, [])).toBe(false);
  });

  it("parses comma-separated origins with trimming", () => {
    expect(parseOrigins(` ${extensionOrigin} , ${websiteOrigin} ,, `)).toEqual([
      extensionOrigin,
      websiteOrigin,
    ]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
  });
});
