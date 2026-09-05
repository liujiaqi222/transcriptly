import { describe, expect, it } from "vitest";
import {
  deserializeError,
  isExtensionOrigin,
  scrubEventUrls,
  scrubUrl,
  serializeError,
} from "@/shared/sentry";

describe("scrubUrl", () => {
  it("keeps the pathname (video ids live there)", () => {
    expect(scrubUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "/watch",
    );
  });

  it("keeps channel handles but drops tracking params", () => {
    expect(scrubUrl("https://www.youtube.com/@veritasium?si=abc123")).toBe(
      "/@veritasium",
    );
  });

  it("passes through non-URL strings untouched", () => {
    expect(scrubUrl("not a url")).toBe("not a url");
  });
});

describe("scrubEventUrls", () => {
  it("scrubs the request url and http breadcrumbs", () => {
    const event = scrubEventUrls({
      request: { url: "https://www.youtube.com/watch?v=abc&t=30" },
      breadcrumbs: [
        { data: { url: "https://www.youtube.com/@channel?si=x" } },
        { data: { method: "GET", status_code: 200 } },
      ],
    });

    expect(event.request?.url).toBe("/watch");
    expect(event.breadcrumbs?.[0]?.data?.url).toBe("/@channel");
    expect(event.breadcrumbs?.[1]?.data).toEqual({
      method: "GET",
      status_code: 200,
    });
  });

  it("handles events without urls", () => {
    expect(scrubEventUrls({ message: "boom" })).toEqual({ message: "boom" });
  });
});

describe("serializeError / deserializeError", () => {
  it("round-trips an Error for the structured-clone message pipe", () => {
    const original = new Error("capture failed");
    original.stack =
      "Error: capture failed\\n    at foo (chrome-extension://id/content.ts:1:1)";

    const round = deserializeError(serializeError(original));

    expect(round).toBeInstanceOf(Error);
    expect(round.message).toBe("capture failed");
    expect(round.stack).toBe(original.stack);
  });

  it("serializes non-errors without throwing", () => {
    expect(serializeError("plain string")).toEqual({
      name: "NonError",
      message: "plain string",
    });
  });
});

describe("isExtensionOrigin", () => {
  const extensionUrl = "chrome-extension://abcdef/";

  it("accepts stack frames from the extension itself", () => {
    expect(
      isExtensionOrigin(
        "Error: x\\n    at foo (chrome-extension://abcdef/content.ts:1:1)",
        extensionUrl,
      ),
    ).toBe(true);
  });

  it("rejects YouTube page errors leaking into our listeners", () => {
    expect(
      isExtensionOrigin(
        "Error: x\\n    at foo (https://www.youtube.com/s/desktop/js/app:1:1)",
        extensionUrl,
      ),
    ).toBe(false);
  });

  it("rejects missing sources", () => {
    expect(isExtensionOrigin(undefined, extensionUrl)).toBe(false);
  });
});
