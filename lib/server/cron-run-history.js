const fs = require("fs");
const path = require("path");

const kMaxRunsLimit = 200;
const kDefaultRunsLimit = 20;
const kGatewayRunsPageSize = 200;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeCronJobId = (jobId = "") => {
  const trimmed = String(jobId || "").trim();
  if (!trimmed) throw new Error("Job id is required");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
    throw new Error("Invalid job id");
  }
  return trimmed;
};

const normalizeRunStatus = (value = "all") => {
  const normalized = String(value || "all").trim().toLowerCase();
  return ["ok", "error", "skipped", "all"].includes(normalized)
    ? normalized
    : "all";
};

const normalizeDeliveryStatus = (value = "all") => {
  const normalized = String(value || "all").trim().toLowerCase();
  return ["delivered", "not-delivered", "unknown", "not-requested", "all"].includes(
    normalized,
  )
    ? normalized
    : "all";
};

const paginate = (items = [], { limit = kMaxRunsLimit, offset = 0 } = {}) => {
  const safeLimit = Math.max(
    1,
    Math.min(kMaxRunsLimit, Number.parseInt(String(limit), 10) || kMaxRunsLimit),
  );
  const safeOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);
  const total = items.length;
  const entries = items.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + entries.length;
  return {
    entries,
    total,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: nextOffset < total,
    nextOffset: nextOffset < total ? nextOffset : null,
  };
};

const parseRunLogLine = (line, jobId) => {
  if (!line) return null;
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== "object") return null;
    if (String(value.action || "") !== "finished") return null;
    if (String(value.jobId || "") !== jobId) return null;
    const ts = toFiniteNumber(value.ts, 0);
    if (!ts) return null;
    return {
      ts,
      jobId,
      action: "finished",
      status: value.status,
      error: value.error,
      summary: value.summary,
      delivered:
        typeof value.delivered === "boolean" ? value.delivered : undefined,
      deliveryStatus: value.deliveryStatus,
      deliveryError: value.deliveryError,
      sessionId: value.sessionId,
      sessionKey: value.sessionKey,
      runAtMs: value.runAtMs,
      durationMs: value.durationMs,
      nextRunAtMs: value.nextRunAtMs,
      model: value.model,
      provider: value.provider,
      usage:
        value.usage && typeof value.usage === "object" ? value.usage : undefined,
    };
  } catch {
    return null;
  }
};

const readLegacyJobRunEntries = ({ runsDir, jobId }) => {
  const safeJobId = sanitizeCronJobId(jobId);
  const runLogPath = path.join(runsDir, `${safeJobId}.jsonl`);
  const raw = fs.existsSync(runLogPath) ? fs.readFileSync(runLogPath, "utf8") : "";
  const entries = String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseRunLogLine(line, safeJobId))
    .filter(Boolean);
  return { runLogPath, entries };
};

const readLegacyJobRuns = ({
  runsDir,
  jobId,
  limit = kDefaultRunsLimit,
  offset = 0,
  status = "all",
  deliveryStatus = "all",
  sortDir = "desc",
  query = "",
}) => {
  const safeJobId = sanitizeCronJobId(jobId);
  const { runLogPath, entries } = readLegacyJobRunEntries({ runsDir, jobId: safeJobId });
  const normalizedStatus = normalizeRunStatus(status);
  const normalizedDeliveryStatus = normalizeDeliveryStatus(deliveryStatus);
  const queryText = String(query || "").trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (normalizedStatus !== "all" && String(entry.status || "") !== normalizedStatus) {
      return false;
    }
    const entryDelivery = String(entry.deliveryStatus || "not-requested");
    if (
      normalizedDeliveryStatus !== "all" &&
      entryDelivery !== normalizedDeliveryStatus
    ) {
      return false;
    }
    if (!queryText) return true;
    return [entry.summary, entry.error, entry.model, entry.provider]
      .map((value) => String(value || ""))
      .join(" ")
      .toLowerCase()
      .includes(queryText);
  });
  filtered.sort((a, b) => {
    if (String(sortDir || "desc").toLowerCase() === "asc") return a.ts - b.ts;
    return b.ts - a.ts;
  });
  return { runLogPath, ...paginate(filtered, { limit, offset }) };
};

const createCronRunHistory = ({
  runsDir,
  listJobs,
  requestGateway,
  requestGatewayWithCli,
}) => {
  const readGatewayRunPage = async ({
    jobId = "",
    scope = "job",
    limit = kDefaultRunsLimit,
    offset = 0,
    status = "all",
    deliveryStatus = "all",
    sortDir = "desc",
    query = "",
  } = {}) => {
    const params = {
      scope: scope === "all" ? "all" : "job",
      limit: Math.max(
        1,
        Math.min(kMaxRunsLimit, Number.parseInt(String(limit), 10) || kDefaultRunsLimit),
      ),
      offset: Math.max(0, Number.parseInt(String(offset), 10) || 0),
      sortDir: String(sortDir || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    };
    if (params.scope === "job") params.jobId = sanitizeCronJobId(jobId);
    const normalizedStatus = normalizeRunStatus(status);
    if (normalizedStatus !== "all") params.status = normalizedStatus;
    const normalizedDeliveryStatus = normalizeDeliveryStatus(deliveryStatus);
    if (normalizedDeliveryStatus !== "all") {
      params.deliveryStatus = normalizedDeliveryStatus;
    }
    const queryText = String(query || "").trim();
    if (queryText) params.query = queryText;

    const page = typeof requestGateway === "function"
      ? await requestGateway("cron.runs", params, 30000)
      : await requestGatewayWithCli(params);
    if (!page || !Array.isArray(page.entries)) {
      throw new Error("OpenClaw returned an invalid cron run history response");
    }
    const safeOffset = Math.max(0, toFiniteNumber(page.offset, params.offset));
    const safeLimit = Math.max(1, toFiniteNumber(page.limit, params.limit));
    const nextOffset = page.nextOffset == null
      ? null
      : Math.max(0, toFiniteNumber(page.nextOffset, safeOffset + page.entries.length));
    return {
      entries: page.entries,
      total: Math.max(0, toFiniteNumber(page.total, page.entries.length)),
      offset: safeOffset,
      limit: safeLimit,
      hasMore: Boolean(page.hasMore),
      nextOffset,
    };
  };

  const readAllGatewayRunEntries = async ({
    jobId = "",
    scope = "job",
    sinceMs = 0,
    status = "all",
    deliveryStatus = "all",
    query = "",
  } = {}) => {
    const safeSinceMs = Math.max(0, toFiniteNumber(sinceMs, 0));
    const entries = [];
    let offset = 0;
    while (true) {
      const page = await readGatewayRunPage({
        jobId,
        scope,
        limit: kGatewayRunsPageSize,
        offset,
        status,
        deliveryStatus,
        query,
        sortDir: "desc",
      });
      entries.push(...page.entries);
      const oldestTimestampMs = page.entries.reduce((oldest, entry) => {
        const timestampMs = toFiniteNumber(entry?.ts, 0);
        if (!timestampMs) return oldest;
        return oldest === 0 ? timestampMs : Math.min(oldest, timestampMs);
      }, 0);
      if (safeSinceMs > 0 && oldestTimestampMs > 0 && oldestTimestampMs < safeSinceMs) {
        break;
      }
      if (!page.hasMore || page.nextOffset == null || page.nextOffset <= offset) break;
      offset = page.nextOffset;
    }
    return safeSinceMs > 0
      ? entries.filter((entry) => toFiniteNumber(entry?.ts, 0) >= safeSinceMs)
      : entries;
  };

  const readLegacyEntriesForScope = ({ jobId = "", scope = "job", sinceMs = 0 } = {}) => {
    const safeSinceMs = Math.max(0, toFiniteNumber(sinceMs, 0));
    const jobs = scope === "all"
      ? listJobs({ sortBy: "name", sortDir: "asc" }).jobs
      : [{ id: sanitizeCronJobId(jobId) }];
    return jobs
      .flatMap((job) => readLegacyJobRunEntries({ runsDir, jobId: job.id }).entries)
      .filter((entry) => safeSinceMs <= 0 || toFiniteNumber(entry?.ts, 0) >= safeSinceMs)
      .sort((a, b) => toFiniteNumber(b?.ts, 0) - toFiniteNumber(a?.ts, 0));
  };

  const readAllRunEntries = async (options = {}) => {
    try {
      return await readAllGatewayRunEntries(options);
    } catch (error) {
      const legacyEntries = readLegacyEntriesForScope(options);
      if (legacyEntries.length > 0) return legacyEntries;
      throw error;
    }
  };

  const getJobRuns = async (options = {}) => {
    const safeJobId = sanitizeCronJobId(options.jobId);
    try {
      return await readGatewayRunPage({ ...options, jobId: safeJobId });
    } catch (error) {
      const legacyRunLogPath = path.join(runsDir, `${safeJobId}.jsonl`);
      if (!fs.existsSync(legacyRunLogPath)) throw error;
      return readLegacyJobRuns({ ...options, runsDir, jobId: safeJobId });
    }
  };

  return { getJobRuns, readAllRunEntries };
};

module.exports = {
  createCronRunHistory,
  kDefaultRunsLimit,
  kMaxRunsLimit,
  sanitizeCronJobId,
};
