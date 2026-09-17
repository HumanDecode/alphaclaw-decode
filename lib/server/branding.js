const kDefaultFaviconUrl = "/img/logo.svg";
const kMaxAssetUrlLength = 2048;
const kMaxInstanceNameLength = 64;

const normalizeInstanceName = (value) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, kMaxInstanceNameLength);

const normalizeAssetUrl = (value, fallback = kDefaultFaviconUrl) => {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > kMaxAssetUrlLength) return fallback;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
};

const resolveBranding = (env = process.env) => {
  const instanceName = normalizeInstanceName(env?.ALPHACLAW_INSTANCE_NAME);
  const faviconUrl = normalizeAssetUrl(env?.ALPHACLAW_FAVICON_URL);
  return {
    instanceName,
    faviconUrl,
    documentTitle: instanceName ? `${instanceName} · AlphaClaw` : "alphaclaw",
  };
};

module.exports = {
  kDefaultFaviconUrl,
  normalizeAssetUrl,
  normalizeInstanceName,
  resolveBranding,
};
