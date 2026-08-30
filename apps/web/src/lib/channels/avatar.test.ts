import { describe, expect, it } from "vitest";
import { displayAvatarUrl } from "./avatar";

describe("displayAvatarUrl", () => {
  it("upsizes the captured size parameter to s176", () => {
    expect(
      displayAvatarUrl(
        "https://yt3.ggpht.com/ytc/APkrVKaZ=s48-c-k-c0x00ffffff-no-rj",
      ),
    ).toBe("https://yt3.ggpht.com/ytc/APkrVKaZ=s176-c-k-c0x00ffffff-no-rj");
    expect(
      displayAvatarUrl("https://yt3.googleusercontent.com/ytc/xyz=s88"),
    ).toBe("https://yt3.googleusercontent.com/ytc/xyz=s176");
  });

  it("leaves already-large and unparameterized URLs untouched", () => {
    expect(displayAvatarUrl("https://yt3.ggpht.com/ytc/a=s176-c")).toBe(
      "https://yt3.ggpht.com/ytc/a=s176-c",
    );
    expect(displayAvatarUrl("https://yt3.ggpht.com/ytc/avatar")).toBe(
      "https://yt3.ggpht.com/ytc/avatar",
    );
  });
});
