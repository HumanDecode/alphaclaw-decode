const { resolveDoctorTimeoutMs } = require("../../lib/server/openclaw-doctor-timeout");

describe("OpenClaw Doctor timeout", () => {
  it("allows ten minutes for database repair instead of the CLI's 15 seconds", () => {
    expect(resolveDoctorTimeoutMs({})).toBe(600_000);
  });

  it("honors the existing Doctor timeout override", () => {
    expect(resolveDoctorTimeoutMs({ ALPHACLAW_OPENCLAW_DOCTOR_TIMEOUT_MS: "900000" })).toBe(900_000);
  });

  it.each(["", "invalid", "0", "-1"])("rejects invalid override %s", (value) => {
    expect(resolveDoctorTimeoutMs({ ALPHACLAW_OPENCLAW_DOCTOR_TIMEOUT_MS: value })).toBe(600_000);
  });
});
