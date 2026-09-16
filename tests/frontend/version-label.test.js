import { formatVersionLabel } from "../../lib/public/js/lib/version-label.js";

describe("frontend/version-label", () => {
  it("formats OpenClaw, AlphaClaw, and Decode versions independently", () => {
    expect(
      formatVersionLabel({
        openclawVersion: "2026.9.3",
        alphaclawVersion: "0.9.35-beta.2",
        decodeVersion: "0.1.0",
      }),
    ).toBe("OpenClaw 2026.9.3 / AlphaClaw 0.9.35-beta.2 / Decode 0.1.0");
  });

  it("omits unavailable versions without leaving separators", () => {
    expect(formatVersionLabel({ decodeVersion: "0.1.0" })).toBe("Decode 0.1.0");
    expect(formatVersionLabel()).toBeNull();
  });
});
