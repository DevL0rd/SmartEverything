import {
  DATABASE_SUFFIXES,
  HUB_STARTUP_DEADLINE_MS,
  HUB_UNIT,
  HUB_UPDATE_CHECK,
  HUB_UPDATE_DATABASE_FILE,
  HUB_UPDATE_LEDGER,
  failedBecause,
  hubUpdateFinished,
  releaseOf,
  withRelease,
  type HubUpdateCheck,
  type HubUpdateLedger,
  type HubUpdatePhase,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { WatchdogOptions } from './self-update-watchdog-contract.ts';
import { ledgerReason } from './self-update-ledger.ts';

export type { WatchdogOptions } from './self-update-watchdog-contract.ts';

const READY_FILE = z.object({ url: z.url({ protocol: /^https?$/u }) });

const LOG_LINE = z.looseObject({
  timestamp: z.string(),
  level: z.string(),
  event: z.string().optional(),
});

const START_FAILURE =
  /^(?:store\.(?:migration_failed|backup_failed)|hub\.start_failed|service\.start_failed)/u;

export interface Verdict {
  readonly ok: boolean;
  readonly checks: readonly HubUpdateCheck[];
}

export interface Flow {
  readonly options: WatchdogOptions;
  readonly now: () => Date;
  readonly events: {
    readonly next: (timeoutMs: number) => Promise<boolean>;
    readonly close: () => void;
  };
  readonly units: {
    readonly act: (verb: 'start' | 'stop' | 'restart', unit: string) => void;
    readonly active: (unit: string) => boolean;
    readonly restarts: (unit: string) => number;
    readonly since: (unit: string) => Date;
  };
  readonly health: {
    readonly status: (url: string) => Promise<number | null>;
    readonly devices: () => Promise<number | null>;
    readonly schema: (file: string) => number | null;
  };
  readonly storage: {
    readonly exists: (path: string) => boolean;
    readonly treeIdentity?: (path: string) => string;
    readonly read: (path: string) => string;
    readonly write: (path: string, text: string) => void;
    readonly makeDirectory: (path: string) => void;
    readonly replaceTree: (from: string, to: string) => void;
    readonly snapshotDatabase: (from: string, to: string) => void;
    readonly renameFile: (from: string, to: string) => void;
    readonly copyFile: (from: string, to: string) => void;
    readonly removeFile: (path: string) => void;
    readonly removeAny: (path: string) => void;
  };
  readonly migrations: {
    readonly restore: (database: string) => boolean;
    readonly clear: (database: string) => void;
  };
  readonly recordLedger?: (ledger: HubUpdateLedger) => void;
  readonly note: (event: string, fields: Readonly<Record<string, unknown>>) => void;
}

export function record(flow: Flow, release: HubUpdateRelease): HubUpdateRelease {
  flow.storage.makeDirectory(dirname(flow.options.ledger));
  const ledger = withRelease(ledgerOf(flow), release);
  if (flow.recordLedger === undefined)
    flow.storage.write(flow.options.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  else flow.recordLedger(ledger);
  flow.note('hub_update.phase', { runId: release.runId, phase: release.phase });
  return release;
}

export function transition(
  flow: Flow,
  phase: HubUpdatePhase,
  change: Partial<HubUpdateRelease> = {},
): HubUpdateRelease {
  const before = current(flow);
  return record(flow, {
    ...before,
    ...change,
    ...(typeof change.reason === 'string' ? { reason: ledgerReason(change.reason) } : {}),
    phase,
    revision: before.revision + 1,
    updatedAt: flow.now().toISOString(),
    finishedAt: hubUpdateFinished({ phase }) ? flow.now().toISOString() : null,
  });
}

function urlOf(flow: Flow): string {
  const file = `${flow.options.data}/service-ready.json`;
  if (!flow.storage.exists(file)) return flow.options.url;
  const parsed = READY_FILE.safeParse(JSON.parse(flow.storage.read(file)));
  return parsed.success ? parsed.data.url : flow.options.url;
}

function startupFailures(flow: Flow): readonly string[] {
  const file = `${flow.options.data}/service.log`;
  if (!flow.storage.exists(file)) return [];
  const since = flow.units.since(HUB_UNIT).getTime();
  return flow.storage
    .read(file)
    .split('\n')
    .flatMap((line) => {
      if (!/"level":"(?:error|exception)"/u.test(line)) return [];
      const parsed = LOG_LINE.safeParse(JSON.parse(line));
      if (!parsed.success || Date.parse(parsed.data.timestamp) < since) return [];
      const event = parsed.data.event ?? 'unnamed';
      return START_FAILURE.test(event) ? [event] : [];
    });
}

function schemaLine(flow: Flow, schema: number | null): string {
  const before = flow.options.startingSchema;
  return before === null
    ? `version ${String(schema)}`
    : `version ${String(schema)}, ${String(before)} before`;
}

function matchesSchema(schema: number | null, expected: number | null): boolean {
  return schema !== null && (expected === null || schema === expected);
}

async function devicesCheck(flow: Flow): Promise<HubUpdateCheck> {
  const devices = await flow.health.devices();
  return {
    name: 'owner API',
    ok: devices !== null,
    detail: devices === null ? 'no authenticated device response' : `${String(devices)} devices`,
  };
}

function unitCheck(flow: Flow, name: string, unit: string): HubUpdateCheck {
  const active = flow.units.active(unit);
  const restarts = flow.units.restarts(unit);
  return {
    name,
    ok: active && restarts === 0,
    detail: `${unit}: ${active ? 'active' : 'inactive'}, ${String(restarts)} automatic restarts`,
  };
}

async function collectChecks(
  flow: Flow,
  expected: number | null,
): Promise<readonly HubUpdateCheck[]> {
  const status = await flow.health.status(urlOf(flow));
  const schema = flow.health.schema(flow.options.database);
  const failures = startupFailures(flow);
  return [
    unitCheck(flow, 'hub unit', HUB_UNIT),
    { name: 'HTTP', ok: status === 200, detail: `GET /privacy answered ${String(status)}` },
    { name: 'schema', ok: matchesSchema(schema, expected), detail: schemaLine(flow, schema) },
    await devicesCheck(flow),
    { name: 'startup errors', ok: failures.length === 0, detail: failures.join(', ') || 'none' },
  ].map((check) => HUB_UPDATE_CHECK.parse(check));
}

export async function checksOf(
  flow: Flow,
  expected: number | null,
): Promise<readonly HubUpdateCheck[]> {
  try {
    return await collectChecks(flow, expected);
  } catch (cause) {
    return [{ name: 'watchdog health', ok: false, detail: ledgerReason(message(cause)) }];
  }
}

export async function until(
  flow: Flow,
  deadlineMs: number,
  reached: () => Promise<boolean>,
): Promise<boolean> {
  const deadline = flow.now().getTime() + deadlineMs;
  for (;;) {
    if (await reached()) return true;
    const remaining = deadline - flow.now().getTime();
    if (remaining <= 0) return false;
    await flow.events.next(remaining);
  }
}

function startupFailed(checks: readonly HubUpdateCheck[]): boolean {
  return checks.some((check) => check.name === 'startup errors' && !check.ok);
}

export async function verifyNew(flow: Flow, expected: number | null): Promise<Verdict> {
  let checks: readonly HubUpdateCheck[] = [];
  const settled = async (): Promise<boolean> => {
    checks = await checksOf(flow, expected);
    return checks.every((check) => check.ok) || startupFailed(checks);
  };
  await until(flow, HUB_STARTUP_DEADLINE_MS, settled);
  return { ok: checks.every((check) => check.ok), checks };
}

export function captureBackup(flow: Flow): HubUpdateRelease {
  const { backup, database, service, startingSchema } = flow.options;
  flow.units.act('stop', HUB_UNIT);
  if (!sameSchema(flow))
    throw new Error(
      `The database schema changed after preflight (expected ${String(startingSchema)})`,
    );
  flow.storage.makeDirectory(backup);
  flow.storage.replaceTree(service, `${backup}/service`);
  flow.storage.snapshotDatabase(database, `${backup}/${HUB_UPDATE_DATABASE_FILE}`);
  return transition(flow, 'backed_up');
}

function restoreDatabase(flow: Flow): void {
  const { backup, database } = flow.options;
  const staged = `${database}.self-update-restore`;
  flow.storage.copyFile(`${backup}/${HUB_UPDATE_DATABASE_FILE}`, staged);
  if (!matchesSchema(flow.health.schema(staged), flow.options.startingSchema))
    throw new Error('The saved database could not be validated before restoration');
  for (const suffix of DATABASE_SUFFIXES) {
    if (suffix !== '') flow.storage.removeFile(`${database}${suffix}`);
  }
  flow.storage.renameFile(staged, database);
}

function restoreData(flow: Flow): void {
  const movedFiles = flow.migrations.restore(`${flow.options.backup}/${HUB_UPDATE_DATABASE_FILE}`);
  flow.storage.replaceTree(`${flow.options.backup}/service`, flow.options.service);
  if (sameSchema(flow) && !movedFiles) return;
  restoreDatabase(flow);
  if (!sameSchema(flow)) throw new Error('the database could not be restored from the backup');
}

export function sameSchema(flow: Flow): boolean {
  return matchesSchema(flow.health.schema(flow.options.database), flow.options.startingSchema);
}

export function ledgerOf(flow: Flow): HubUpdateLedger {
  const { ledger } = flow.options;
  return flow.storage.exists(ledger)
    ? HUB_UPDATE_LEDGER.parse(JSON.parse(flow.storage.read(ledger)))
    : { releases: [] };
}

export function current(flow: Flow): HubUpdateRelease {
  const release = releaseOf(ledgerOf(flow), flow.options.runId);
  if (release === undefined)
    throw new Error(`The hub update ${flow.options.runId} is not recorded`);
  return release;
}

export function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function restoreService(flow: Flow): Promise<string | null> {
  try {
    flow.units.act('stop', HUB_UNIT);
    restoreData(flow);
    flow.units.act('start', HUB_UNIT);
    const verdict = await verifyNew(flow, flow.options.startingSchema);
    return verdict.ok
      ? null
      : `the restored hub failed its checks: ${failedBecause(verdict.checks)}`;
  } catch (cause) {
    return message(cause);
  }
}

export async function revert(flow: Flow, reason: string): Promise<HubUpdateRelease> {
  transition(flow, 'reverting', { reason });
  flow.storage.removeAny(flow.options.health);
  const failure = await restoreService(flow);
  if (failure === null) {
    flow.note('hub_update.reverted', {});
    const release = transition(flow, 'reverted', { reason });
    cleanVerifiedBackup(flow);
    return release;
  }
  flow.note('hub_update.unrecoverable', { reason, failure });
  return transition(flow, 'unrecoverable', {
    reason: `${reason}; restoring the saved release failed: ${failure}`,
  });
}

export function cleanVerifiedBackup(flow: Flow): void {
  if (!flow.storage.exists(flow.options.backup)) return;
  try {
    flow.migrations.clear(`${flow.options.backup}/${HUB_UPDATE_DATABASE_FILE}`);
    flow.storage.removeAny(flow.options.backup);
    flow.note('hub_update.backup_removed', {});
  } catch (cause) {
    flow.note('hub_update.cleanup_failed', { reason: message(cause) });
  }
}
