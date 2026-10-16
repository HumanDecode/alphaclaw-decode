const resolveDoctorTimeoutMs = (env = process.env) => {
  const configured = Number.parseInt(
    String(env?.ALPHACLAW_OPENCLAW_DOCTOR_TIMEOUT_MS || ""),
    10,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 600_000;
};

module.exports = { resolveDoctorTimeoutMs };
