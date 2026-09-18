const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createCronService } = require("../../lib/server/cron-service");

const createOpenclawDirWithCronJobs = (jobs = []) => {
  const openclawDir = fs.mkdtempSync(path.join(os.tmpdir(), "alphaclaw-cron-"));
  fs.mkdirSync(path.join(openclawDir, "cron"), { recursive: true });
  fs.writeFileSync(
    path.join(openclawDir, "cron", "jobs.json"),
    JSON.stringify({ version: 1, jobs }),
    "utf8",
  );
  return openclawDir;
};

const addSqliteCronStore = (openclawDir, jobs = []) => {
  const databaseDir = path.join(openclawDir, "state");
  const databasePath = path.join(databaseDir, "openclaw.sqlite");
  const storeKey = path.join(openclawDir, "cron", "jobs.json");
  fs.mkdirSync(databaseDir, { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
      CREATE TABLE cron_jobs (
        store_key TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_json TEXT NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        runtime_updated_at_ms INTEGER,
        updated_at INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        next_run_at_ms INTEGER,
        running_at_ms INTEGER,
        last_run_at_ms INTEGER,
        last_run_status TEXT,
        last_error TEXT,
        last_duration_ms INTEGER,
        consecutive_errors INTEGER,
        consecutive_skipped INTEGER,
        schedule_error_count INTEGER,
        last_delivery_status TEXT,
        last_delivery_error TEXT,
        last_delivered INTEGER,
        last_failure_alert_at_ms INTEGER,
        PRIMARY KEY (store_key, job_id)
      )
    `);
    const insert = db.prepare(`
      INSERT INTO cron_jobs (
        store_key,
        job_id,
        job_json,
        state_json,
        runtime_updated_at_ms,
        updated_at,
        sort_order,
        next_run_at_ms,
        last_run_status,
        last_delivered
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    jobs.forEach((job, index) => {
      const { state = {}, ...jobConfig } = job;
      insert.run(
        storeKey,
        job.id,
        JSON.stringify(jobConfig),
        JSON.stringify(state),
        job.updatedAtMs || job.createdAtMs || 1,
        job.updatedAtMs || job.createdAtMs || 1,
        index,
        state.nextRunAtMs ?? null,
        state.lastRunStatus ?? null,
        typeof state.lastDelivered === "boolean" ? Number(state.lastDelivered) : null,
      );
    });
  } finally {
    db.close();
  }
  return databasePath;
};

describe("server/cron-service", () => {
  it("lists jobs from OpenClaw SQLite instead of stale legacy JSON", () => {
    const openclawDir = createOpenclawDirWithCronJobs([
      {
        id: "stale-job",
        name: "Stale Job",
        enabled: true,
      },
    ]);
    const databasePath = addSqliteCronStore(openclawDir, [
      {
        id: "sqlite-job",
        name: "SQLite Job",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 4,
        schedule: { kind: "cron", expr: "0 8 * * *" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: { kind: "agentTurn", message: "current prompt" },
        state: {
          nextRunAtMs: 500,
          lastRunStatus: "ok",
          lastDelivered: true,
        },
      },
    ]);
    try {
      const cronService = createCronService({
        clawCmd: vi.fn(),
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
      });

      expect(cronService.listJobs()).toEqual({
        storePath: databasePath,
        jobs: [
          expect.objectContaining({
            id: "sqlite-job",
            name: "SQLite Job",
            updatedAtMs: 4,
            state: expect.objectContaining({
              nextRunAtMs: 500,
              lastRunStatus: "ok",
              lastDelivered: true,
            }),
          }),
        ],
      });
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("does not resurrect legacy JSON jobs when the SQLite cron table is empty", () => {
    const openclawDir = createOpenclawDirWithCronJobs([
      { id: "stale-job", name: "Stale Job", enabled: true },
    ]);
    const databasePath = addSqliteCronStore(openclawDir, []);
    try {
      const cronService = createCronService({
        clawCmd: vi.fn(),
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
      });

      expect(cronService.listJobs()).toEqual({
        storePath: databasePath,
        jobs: [],
      });
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("uses plain cron commands without --json for run/toggle/edit", async () => {
    const openclawDir = createOpenclawDirWithCronJobs([
      {
        id: "job-a",
        name: "Job A",
        enabled: true,
        createdAtMs: 1,
        schedule: { kind: "cron", expr: "0 8 * * *" },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: { kind: "agentTurn", message: "old prompt" },
        state: {},
      },
    ]);
    const clawCmd = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, stdout: "ran job-a" })
      .mockResolvedValueOnce({ ok: true, stdout: "disabled job-a" })
      .mockResolvedValueOnce({ ok: true, stdout: "enabled job-a" })
      .mockResolvedValueOnce({ ok: true, stdout: "updated prompt" })
      .mockResolvedValueOnce({ ok: true, stdout: "updated routing" });
    try {
      const cronService = createCronService({
        clawCmd,
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
      });

      const runResult = await cronService.runJobNow("job-a");
      expect(clawCmd).toHaveBeenCalledTimes(1);
      expect(clawCmd).toHaveBeenNthCalledWith(
        1,
        "cron run 'job-a'",
        expect.objectContaining({ quiet: true }),
      );
      expect(runResult.raw).toBe("ran job-a");

      const result = await cronService.setJobEnabled({
        jobId: "job-a",
        enabled: false,
      });

      expect(clawCmd).toHaveBeenCalledTimes(2);
      expect(clawCmd).toHaveBeenNthCalledWith(
        2,
        "cron disable 'job-a'",
        expect.objectContaining({ quiet: true }),
      );
      expect(result.raw).toBe("disabled job-a");
      expect(result.parsed).toBeNull();

      const secondResult = await cronService.setJobEnabled({
        jobId: "job-a",
        enabled: true,
      });
      expect(clawCmd).toHaveBeenCalledTimes(3);
      expect(clawCmd).toHaveBeenNthCalledWith(
        3,
        "cron enable 'job-a'",
        expect.objectContaining({ quiet: true }),
      );
      expect(secondResult.raw).toBe("enabled job-a");

      const promptResult = await cronService.updateJobPrompt({
        jobId: "job-a",
        message: "hello world",
      });
      expect(clawCmd).toHaveBeenCalledTimes(4);
      expect(clawCmd).toHaveBeenNthCalledWith(
        4,
        "cron edit 'job-a' --message 'hello world'",
        expect.objectContaining({ quiet: true }),
      );
      expect(promptResult.raw).toBe("updated prompt");

      const routingResult = await cronService.updateJobRouting({
        jobId: "job-a",
        sessionTarget: "isolated",
        wakeMode: "next-heartbeat",
        deliveryMode: "announce",
        deliveryChannel: "telegram",
        deliveryTo: "123",
      });
      expect(clawCmd).toHaveBeenCalledTimes(5);
      expect(clawCmd).toHaveBeenNthCalledWith(
        5,
        "cron edit 'job-a' --session 'isolated' --wake 'next-heartbeat' --announce --channel 'telegram' --to '123'",
        expect.objectContaining({ quiet: true }),
      );
      expect(routingResult.raw).toBe("updated routing");
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("uses --system-event when editing main systemEvent job prompts", async () => {
    const openclawDir = createOpenclawDirWithCronJobs([]);
    addSqliteCronStore(openclawDir, [
      {
        id: "job-main",
        name: "Main Job",
        enabled: true,
        createdAtMs: 1,
        schedule: { kind: "cron", expr: "0 8 * * *" },
        sessionTarget: "main",
        wakeMode: "now",
        payload: { kind: "systemEvent", text: "old prompt" },
        state: {},
      },
    ]);
    try {
      const clawCmd = vi.fn().mockResolvedValue({ ok: true, stdout: "updated prompt" });
      const cronService = createCronService({
        clawCmd,
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
      });

      const result = await cronService.updateJobPrompt({
        jobId: "job-main",
        message: "new prompt",
      });

      expect(clawCmd).toHaveBeenCalledWith(
        "cron edit 'job-main' --system-event 'new prompt'",
        expect.objectContaining({ quiet: true }),
      );
      expect(result.raw).toBe("updated prompt");
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("reads cron run history through the OpenClaw gateway", async () => {
    const openclawDir = createOpenclawDirWithCronJobs([]);
    const gatewayPage = {
      entries: [
        {
          ts: 1773291600000,
          jobId: "job-a",
          action: "finished",
          status: "ok",
          durationMs: 1200,
        },
      ],
      total: 1,
      offset: 0,
      limit: 20,
      hasMore: false,
      nextOffset: null,
    };
    const clawCmd = vi.fn();
    const requestGateway = vi.fn().mockResolvedValue(gatewayPage);
    try {
      const cronService = createCronService({
        clawCmd,
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
        requestGateway,
      });

      const runs = await cronService.getJobRuns({ jobId: "job-a", limit: 20 });

      expect(runs.entries).toEqual(gatewayPage.entries);
      expect(runs.total).toBe(1);
      expect(requestGateway).toHaveBeenCalledWith(
        "cron.runs",
        expect.objectContaining({ jobId: "job-a", scope: "job", limit: 20 }),
        30000,
      );
      expect(clawCmd).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("falls back to legacy JSONL run history when the gateway is unavailable", async () => {
    const openclawDir = createOpenclawDirWithCronJobs([]);
    const runsDir = path.join(openclawDir, "cron", "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    fs.writeFileSync(
      path.join(runsDir, "job-a.jsonl"),
      `${JSON.stringify({
        ts: 1773291600000,
        jobId: "job-a",
        action: "finished",
        status: "ok",
      })}\n`,
      "utf8",
    );
    try {
      const cronService = createCronService({
        clawCmd: vi.fn(),
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
        requestGateway: vi.fn().mockRejectedValue(new Error("gateway unavailable")),
      });

      const runs = await cronService.getJobRuns({ jobId: "job-a" });

      expect(runs.entries).toEqual([
        expect.objectContaining({ jobId: "job-a", status: "ok" }),
      ]);
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("paginates gateway history when calculating run trends", async () => {
    const openclawDir = createOpenclawDirWithCronJobs([]);
    const nowMs = Date.now();
    const requestGateway = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [
          {
            ts: nowMs - 60 * 60 * 1000,
            jobId: "job-a",
            action: "finished",
            status: "ok",
            durationMs: 1000,
          },
        ],
        total: 2,
        offset: 0,
        limit: 200,
        hasMore: true,
        nextOffset: 1,
      })
      .mockResolvedValueOnce({
        entries: [
          {
            ts: nowMs - 2 * 60 * 60 * 1000,
            jobId: "job-a",
            action: "finished",
            status: "error",
            durationMs: 3000,
          },
        ],
        total: 2,
        offset: 1,
        limit: 200,
        hasMore: false,
        nextOffset: null,
      });
    try {
      const cronService = createCronService({
        clawCmd: vi.fn(),
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
        requestGateway,
      });

      const trends = await cronService.getJobRunTrends({
        jobId: "job-a",
        range: "24h",
      });

      expect(trends.points.reduce((total, point) => total + point.totalRuns, 0)).toBe(2);
      expect(trends.points.reduce((total, point) => total + point.ok, 0)).toBe(1);
      expect(trends.points.reduce((total, point) => total + point.error, 0)).toBe(1);
      expect(requestGateway).toHaveBeenCalledTimes(2);
      expect(requestGateway.mock.calls[0][1]).toEqual(
        expect.objectContaining({ jobId: "job-a", offset: 0, limit: 200 }),
      );
      expect(requestGateway.mock.calls[1][1]).toEqual(
        expect.objectContaining({ jobId: "job-a", offset: 1, limit: 200 }),
      );
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });

  it("groups gateway run history for the all-jobs overview", async () => {
    const openclawDir = createOpenclawDirWithCronJobs([
      { id: "job-a", name: "Job A", enabled: true, state: {} },
      { id: "job-b", name: "Job B", enabled: true, state: {} },
    ]);
    const requestGateway = vi.fn().mockResolvedValue({
      entries: [
        { ts: 300, jobId: "job-a", action: "finished", status: "ok" },
        { ts: 200, jobId: "job-b", action: "finished", status: "error" },
        { ts: 100, jobId: "job-a", action: "finished", status: "skipped" },
      ],
      total: 3,
      offset: 0,
      limit: 200,
      hasMore: false,
      nextOffset: null,
    });
    try {
      const cronService = createCronService({
        clawCmd: vi.fn(),
        OPENCLAW_DIR: openclawDir,
        getSessionUsageByKeyPattern: vi.fn(() => ({})),
        requestGateway,
      });

      const runs = await cronService.getBulkJobRuns({ limitPerJob: 20 });

      expect(runs.byJobId["job-a"].entries).toHaveLength(2);
      expect(runs.byJobId["job-b"].entries).toHaveLength(1);
      expect(requestGateway).toHaveBeenCalledWith(
        "cron.runs",
        expect.objectContaining({ scope: "all", offset: 0, limit: 200 }),
        30000,
      );
    } finally {
      fs.rmSync(openclawDir, { recursive: true, force: true });
    }
  });
});
