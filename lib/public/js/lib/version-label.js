export const formatVersionLabel = ({
  openclawVersion = "",
  alphaclawVersion = "",
  decodeVersion = "",
} = {}) => {
  const versions = [
    ["OpenClaw", openclawVersion],
    ["AlphaClaw", alphaclawVersion],
    ["Decode", decodeVersion],
  ];

  const labels = versions
    .map(([name, version]) => [name, String(version || "").trim()])
    .filter(([, version]) => version)
    .map(([name, version]) => `${name} ${version}`);

  return labels.length ? labels.join(" / ") : null;
};
