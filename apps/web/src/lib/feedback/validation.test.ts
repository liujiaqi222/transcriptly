import { describe, expect, it } from "vitest";
import { validateFeedbackPayload } from "./validation";

const base = {
  rating: 3,
  reasons: ["did-not-work", "too-slow"],
  details: {
    "did-not-work": "Transcripts never loaded.",
    "too-slow": "Capturing took minutes.",
  },
  contactEmail: "user@example.com",
  extensionVersion: "1.2.3",
};

describe("feedback validation", () => {
  it("accepts a complete submission", () => {
    expect(validateFeedbackPayload(base)).toMatchObject({
      source: "uninstall",
      rating: 3,
      reasons: ["did-not-work", "too-slow"],
      details: {
        "did-not-work": "Transcripts never loaded.",
        "too-slow": "Capturing took minutes.",
      },
      contactEmail: "user@example.com",
      extensionVersion: "1.2.3",
    });
  });

  it("defaults the source to uninstall and reasons to an empty list", () => {
    expect(validateFeedbackPayload({ rating: 5 })).toEqual({
      source: "uninstall",
      rating: 5,
      reasons: [],
    });
  });

  it("dedupes reasons", () => {
    expect(
      validateFeedbackPayload({ rating: 2, reasons: ["other", "other"] })
        ?.reasons,
    ).toEqual(["other"]);
  });

  it("rejects reasons outside the taxonomy", () => {
    expect(
      validateFeedbackPayload({ rating: 2, reasons: ["privacy"] }),
    ).toBeUndefined();
  });

  it("rejects detail keys outside the taxonomy", () => {
    expect(
      validateFeedbackPayload({ rating: 2, details: { privacy: "worried" } }),
    ).toBeUndefined();
  });

  it("rejects out-of-range ratings", () => {
    expect(validateFeedbackPayload({ rating: 0 })).toBeUndefined();
    expect(validateFeedbackPayload({ rating: 6 })).toBeUndefined();
    expect(validateFeedbackPayload({ rating: 2.5 })).toBeUndefined();
  });

  it("rejects malformed contact emails", () => {
    expect(
      validateFeedbackPayload({ rating: 2, contactEmail: "not-an-email" }),
    ).toBeUndefined();
  });

  it("normalizes empty strings to undefined", () => {
    const result = validateFeedbackPayload({
      rating: 2,
      details: { other: "   " },
      contactEmail: "",
    });
    expect(result?.details).toBeUndefined();
    expect(result?.contactEmail).toBeUndefined();
  });

  it("drops blank entries but keeps filled ones", () => {
    expect(
      validateFeedbackPayload({
        rating: 2,
        details: { other: "  ", "too-slow": "popup" },
      })?.details,
    ).toEqual({ "too-slow": "popup" });
  });

  it("trims details", () => {
    expect(
      validateFeedbackPayload({
        rating: 2,
        details: { "too-slow": "  popup sluggish  " },
      })?.details,
    ).toEqual({ "too-slow": "popup sluggish" });
  });

  it("lets a filled honeypot pass validation so the route can fake success", () => {
    expect(
      validateFeedbackPayload({
        rating: 2,
        website: "http://spam.example",
      }),
    ).toMatchObject({ website: "http://spam.example" });
  });

  it("rejects an oversized honeypot", () => {
    expect(
      validateFeedbackPayload({ rating: 2, website: "x".repeat(201) }),
    ).toBeUndefined();
  });

  it("rejects an oversized extension version", () => {
    expect(
      validateFeedbackPayload({ rating: 2, extensionVersion: "x".repeat(33) }),
    ).toBeUndefined();
  });
});
