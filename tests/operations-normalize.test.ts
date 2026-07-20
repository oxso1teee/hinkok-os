import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  latestRunsByJob,
  normalizeSystemJobRun,
  overallSystemHealth,
  systemJobHealth,
} from "../src/lib/operations/normalize";

function run(overrides: Record<string, unknown> = {}) {
  return normalizeSystemJobRun({
    id: "1787e20b-24ba-42db-8870-f4b08982d635",
    job_name: "obsidian_sync",
    trigger_source: "cron",
    status: "succeeded",
    started_at: "2026-07-18T03:00:00.000Z",
    finished_at: "2026-07-18T03:00:02.000Z",
    duration_ms: 2_000,
    summary: { noteCount: 20, indexed: true, nested: { unsafe: true } },
    error_code: null,
    ...overrides,
  });
}

test("normalizes a bounded technical system-job record", () => {
  const value = run();
  assert.ok(value);
  assert.equal(value.jobName, "obsidian_sync");
  assert.equal(value.status, "succeeded");
  assert.deepEqual(value.summary, { noteCount: 20, indexed: true });
});

test("rejects malformed job names, timestamps and durations", () => {
  assert.equal(run({ job_name: "arbitrary_job" }), null);
  assert.equal(run({ started_at: "not-a-date" }), null);
  assert.equal(run({ duration_ms: -1 }), null);
});

test("selects the newest run for every job regardless of input order", () => {
  const older = run({ started_at: "2026-07-17T03:00:00.000Z" });
  const newer = run({ id: "newer", started_at: "2026-07-18T03:00:00.000Z" });
  const finance = run({
    id: "finance",
    job_name: "finance_sync",
    started_at: "2026-07-18T03:15:00.000Z",
  });
  const calendar = run({
    id: "calendar",
    job_name: "calendar_sync",
    started_at: "2026-07-18T03:05:00.000Z",
  });
  assert.ok(older && newer && finance && calendar);
  const latest = latestRunsByJob([older, finance, calendar, newer]);
  assert.equal(latest.obsidian_sync?.id, "newer");
  assert.equal(latest.calendar_sync?.id, "calendar");
  assert.equal(latest.finance_sync?.id, "finance");
  assert.equal(latest.weekly_insight, null);
});

test("reports configuration and database availability before run freshness", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  assert.equal(systemJobHealth({ configured: false, dataAvailable: true, latest: null, expectedWithinMs: 1, now }), "disabled");
  assert.equal(systemJobHealth({ configured: true, dataAvailable: false, latest: null, expectedWithinMs: 1, now }), "unavailable");
  assert.equal(systemJobHealth({ configured: true, dataAvailable: true, latest: null, expectedWithinMs: 1, now }), "pending");
});

test("distinguishes running, failed, fresh and overdue runs", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const common = { configured: true, dataAvailable: true, expectedWithinMs: 60 * 60 * 1_000, now };
  const running = run({ status: "running", finished_at: null, duration_ms: null });
  const failed = run({ status: "failed", error_code: "job_failed" });
  const fresh = run({ started_at: "2026-07-18T11:30:00.000Z" });
  const stale = run({ started_at: "2026-07-18T10:00:00.000Z" });
  assert.ok(running && failed && fresh && stale);
  assert.equal(systemJobHealth({ ...common, latest: running }), "running");
  assert.equal(systemJobHealth({ ...common, latest: failed }), "attention");
  assert.equal(systemJobHealth({ ...common, latest: fresh }), "healthy");
  assert.equal(systemJobHealth({ ...common, latest: stale }), "stale");
});

test("prioritizes unavailable and attention states in the overall status", () => {
  assert.equal(overallSystemHealth(["healthy", "unavailable"]), "unavailable");
  assert.equal(overallSystemHealth(["healthy", "stale"]), "attention");
  assert.equal(overallSystemHealth(["healthy", "running"]), "running");
  assert.equal(overallSystemHealth(["disabled", "disabled"]), "disabled");
});

test("monitoring migration keeps browser roles closed and claims jobs atomically", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202607180012_operations_monitoring.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all privileges[\s\S]+from anon, authenticated/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /create unique index[\s\S]+where status = 'running'/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
});

test("calendar monitoring migration expands the allow-list safely", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202607190015_calendar_job_monitoring.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /system_job_runs_job_name_check/i);
  assert.match(sql, /'calendar_sync'/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]+to service_role/i);
});
