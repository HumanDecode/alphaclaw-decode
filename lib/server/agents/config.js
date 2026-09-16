const kUnsafeObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

const isRecord = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const hasCanonicalAgentEntries = (cfg = {}) =>
  isRecord(cfg?.agents) &&
  Object.prototype.hasOwnProperty.call(cfg.agents, "entries") &&
  isRecord(cfg.agents.entries);

const listConfiguredAgents = (cfg = {}) => {
  const agents = isRecord(cfg?.agents) ? cfg.agents : {};
  if (hasCanonicalAgentEntries(cfg)) {
    return Object.entries(agents.entries)
      .filter(
        ([agentId, entry]) =>
          !kUnsafeObjectKeys.has(agentId) && isRecord(entry),
      )
      .map(([agentId, entry]) => ({ ...entry, id: agentId }));
  }
  return (Array.isArray(agents.list) ? agents.list : [])
    .filter((entry) => isRecord(entry))
    .map((entry) => ({ ...entry }));
};

const resolveConfiguredDefaultAgentId = (cfg = {}, agents = null) => {
  const configuredAgents = Array.isArray(agents)
    ? agents
    : listConfiguredAgents(cfg);
  const configuredIds = new Set(
    configuredAgents
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean),
  );
  const canonicalDefault = String(
    cfg?.agents?.defaults?.systemAgent?.agentId || "",
  ).trim();
  if (canonicalDefault && configuredIds.has(canonicalDefault)) {
    return canonicalDefault;
  }
  const legacyDefault = configuredAgents.find((entry) => !!entry?.default);
  const legacyDefaultId = String(legacyDefault?.id || "").trim();
  if (legacyDefaultId) return legacyDefaultId;
  if (configuredIds.has("main")) return "main";
  return String(configuredAgents[0]?.id || "").trim();
};

const applyDefaultAgentMarkers = (cfg = {}, agents = []) => {
  const defaultAgentId = resolveConfiguredDefaultAgentId(cfg, agents);
  return agents.map((entry) => ({
    ...entry,
    default: String(entry?.id || "").trim() === defaultAgentId,
  }));
};

const serializeCanonicalAgentEntries = (cfg = {}) => {
  if (!hasCanonicalAgentEntries(cfg)) return cfg;
  const agents = cfg.agents || {};
  const normalizedList = Array.isArray(agents.list)
    ? agents.list.filter((entry) => isRecord(entry))
    : listConfiguredAgents(cfg);
  const entries = {};
  for (const entry of normalizedList) {
    const agentId = String(entry?.id || "").trim();
    if (!agentId || kUnsafeObjectKeys.has(agentId)) continue;
    const { id: _id, default: _default, ...agentConfig } = entry;
    entries[agentId] = agentConfig;
  }
  const selectedDefaultAgentId = String(
    normalizedList.find((entry) => !!entry?.default)?.id || "",
  ).trim();
  const defaultAgentId =
    selectedDefaultAgentId ||
    resolveConfiguredDefaultAgentId(cfg, normalizedList);
  const { list: _list, ownership: _ownership, ...agentConfig } = agents;
  const existingDefaults = isRecord(agentConfig.defaults)
    ? agentConfig.defaults
    : {};
  const existingSystemAgent = isRecord(existingDefaults.systemAgent)
    ? existingDefaults.systemAgent
    : {};
  return {
    ...cfg,
    agents: {
      ...agentConfig,
      defaults: {
        ...existingDefaults,
        ...(defaultAgentId
          ? {
              systemAgent: {
                ...existingSystemAgent,
                agentId: defaultAgentId,
              },
            }
          : {}),
      },
      ...(Object.keys(entries).length > 1 ? { ownership: "explicit" } : {}),
      entries,
    },
  };
};

module.exports = {
  applyDefaultAgentMarkers,
  hasCanonicalAgentEntries,
  listConfiguredAgents,
  resolveConfiguredDefaultAgentId,
  serializeCanonicalAgentEntries,
};
