const {
  assertSupportedNodeVersion,
  isSupportedNodeVersion,
  parseNodeVersion,
} = require("../../lib/node-runtime");

describe("node-runtime", () => {
  it("parses semantic Node versions", () => {
    expect(parseNodeVersion("22.22.3")).toEqual([22, 22, 3]);
    expect(parseNodeVersion("v24.15.0")).toBeNull();
  });

  it("enforces the OpenClaw 2026.10.6 Node floor", () => {
    expect(isSupportedNodeVersion("22.22.3")).toBe(false);
    expect(isSupportedNodeVersion("23.9.0")).toBe(false);
    expect(isSupportedNodeVersion("24.22.0")).toBe(false);
    expect(isSupportedNodeVersion("24.22.1")).toBe(true);
    expect(isSupportedNodeVersion("25.9.0")).toBe(false);
    expect(isSupportedNodeVersion("26.12.0")).toBe(false);
    expect(isSupportedNodeVersion("26.12.1")).toBe(true);
    expect(isSupportedNodeVersion("27.0.0")).toBe(true);
  });

  it("throws an actionable error for unsupported runtimes", () => {
    expect(() => assertSupportedNodeVersion("22.22.3")).toThrow(
      "requires Node.js >=24.22.1",
    );
  });
});
