import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backUpRelease,
  builtServiceProblems,
  checkMigrations,
  hubLayout,
  ReleaseStepError,
  restoreDatabase,
  restoreService,
  schemaVersionOf,
  SERVICE_FILES,
  swapService,
  type HubLayout,
} from '../release-hub-files.ts';
import { failedChecks, releasePlan, rollbackWith } from '../release-hub.ts';
import {
  awaitHub,
  errorEventsSince,
  HUB_UNIT,
  NODE_UNIT,
  verifyHub,
  type Units,
} from '../release-hub-verify.ts';

let scratch = '';
let layout: HubLayout;
let server: Server;
let url = '';

function writeService(directory: string, marker: string): void {
  mkdirSync(directory, { recursive: true });
  for (const file of SERVICE_FILES) writeFileSync(join(directory, file), `${marker} ${file}`);
}

function writeDatabase(path: string, version: number): void {
  const database = new DatabaseSync(path);
  database.exec(
    'create table schema_version (version integer primary key, name text not null, applied_at text not null)',
  );
  database.exec(`insert into schema_version values (${String(version)}, 'x', 'now')`);
  database.close();
}

function fakeUnits(calls: string[], active = true): Units {
  return {
    restart: (unit) => calls.push(`restart ${unit}`),
    stop: (unit) => calls.push(`stop ${unit}`),
    start: (unit) => calls.push(`start ${unit}`),
    isActive: () => active,
    activeSince: () => new Date('2026-10-18T00:00:00Z'),
  };
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'release-hub-'));
  layout = hubLayout(join(scratch, 'install'), join(scratch, 'data'));
  writeService(layout.service, 'old');
  mkdirSync(layout.data, { recursive: true });
  writeDatabase(layout.database, 5);
  writeFileSync(join(layout.data, 'owner-token'), 'secret-token\n');
  writeFileSync(join(layout.data, 'service.log'), '');
  server = createServer((request, response) => {
    const authorised = request.headers.authorization === 'Bearer secret-token';
    if (request.url === '/privacy') response.writeHead(200).end('page');
    else if (request.url === '/api/devices' && authorised) response.writeHead(200).end('[1,2,3]');
    else response.writeHead(401).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(scratch, { recursive: true, force: true });
});

describe('backing up a release', () => {
  it('copies the live service and a consistent copy of the database into a named folder', () => {
    const backup = backUpRelease(layout, 'release18', 1234);
    expect(backup).toBe(join(layout.backups, 'release18-1234'));
    expect(readFileSync(join(backup, 'service', 'service.mjs'), 'utf8')).toBe('old service.mjs');
    expect(schemaVersionOf(join(backup, 'smarteverything.db'))).toBe(5);
  });

  it('leaves the live database untouched', () => {
    const before = readFileSync(layout.database);
    backUpRelease(layout, 'release18', 1);
    expect(readFileSync(layout.database).equals(before)).toBe(true);
  });
});

describe('swapping the service', () => {
  it('puts the built service in place and keeps the replaced one beside it', () => {
    const built = join(scratch, 'built');
    writeService(built, 'new');
    const aside = swapService(layout, built, 'release18');
    expect(readFileSync(join(layout.service, 'service.mjs'), 'utf8')).toBe('new service.mjs');
    expect(readFileSync(join(aside, 'service.mjs'), 'utf8')).toBe('old service.mjs');
  });

  it('puts the old service back when the copy fails', () => {
    expect(() => swapService(layout, join(scratch, 'missing'), 'release18')).toThrow(
      ReleaseStepError,
    );
    expect(readFileSync(join(layout.service, 'service.mjs'), 'utf8')).toBe('old service.mjs');
  });

  it('names every file a built service lacks', () => {
    const built = join(scratch, 'partial');
    mkdirSync(built);
    writeFileSync(join(built, 'service.mjs'), '');
    expect(builtServiceProblems(built)).toHaveLength(2);
  });
});

describe('rolling back', () => {
  it('restores the service and, when asked, the database, keeping what it replaced', async () => {
    const backup = backUpRelease(layout, 'release18', 1);
    writeService(layout.service, 'broken');
    writeDatabase(join(scratch, 'newer.db'), 9);
    rmSync(layout.database);
    writeFileSync(layout.database, readFileSync(join(scratch, 'newer.db')));
    const calls: string[] = [];
    await rollbackWith({
      layout,
      units: fakeUnits(calls),
      backup,
      url,
      withDatabase: true,
      stamp: 's',
    });
    expect(readFileSync(join(layout.service, 'service.mjs'), 'utf8')).toBe('old service.mjs');
    expect(schemaVersionOf(layout.database)).toBe(5);
    expect(existsSync(`${layout.database}.rolled-back-s`)).toBe(true);
    expect(existsSync(`${layout.service}.rolled-back-s`)).toBe(true);
    expect(calls).toEqual([
      `stop ${NODE_UNIT}`,
      `stop ${HUB_UNIT}`,
      `start ${HUB_UNIT}`,
      `start ${NODE_UNIT}`,
    ]);
  });

  it('leaves the database alone unless asked', () => {
    const backup = backUpRelease(layout, 'release18', 1);
    restoreService(layout, backup, 's');
    expect(existsSync(`${layout.database}.rolled-back-s`)).toBe(false);
    restoreDatabase(layout, backup, 't');
    expect(existsSync(`${layout.database}.rolled-back-t`)).toBe(true);
  });
});

describe('verifying the hub', () => {
  it('passes when the units run, the page answers, the schema matches and devices are listed', async () => {
    const checks = await verifyHub(layout, url, fakeUnits([]), 5);
    expect(failedChecks(checks)).toEqual([]);
    expect(checks.map((check) => check.detail)).toContain('3 devices');
  });

  it('fails a wrong schema, a stopped unit and a startup failure in the log', async () => {
    writeFileSync(
      join(layout.data, 'service.log'),
      `${JSON.stringify({ timestamp: '2026-10-18T01:00:00Z', level: 'error', event: 'store.migration_failed' })}\n`,
    );
    const failed = failedChecks(await verifyHub(layout, url, fakeUnits([], false), 6)).map(
      (check) => check.name,
    );
    expect(failed).toEqual(['hub unit', 'node unit', 'schema', 'startup errors']);
  });

  it('counts only error lines written after the hub started', () => {
    const log = join(scratch, 'lines.log');
    const line = (timestamp: string, level: string, event: string): string =>
      JSON.stringify({ timestamp, level, event });
    writeFileSync(
      log,
      [
        line('2026-10-17T23:00:00Z', 'error', 'old.error'),
        line('2026-10-18T01:00:00Z', 'error', 'new.error'),
        line('2026-10-18T01:00:00Z', 'info', 'new.info'),
      ].join('\n'),
    );
    expect(errorEventsSince(log, new Date('2026-10-18T00:00:00Z'))).toEqual(['new.error']);
  });

  it('waits for the hub to answer', async () => {
    await expect(awaitHub(url)).resolves.toBeUndefined();
  });
});

describe('the release plan', () => {
  it('lists every step in order and runs nothing until a step is run', () => {
    const calls: string[] = [];
    const plan = releasePlan({
      layout,
      units: fakeUnits(calls),
      name: 'release18',
      built: join(scratch, 'built'),
      url,
      schema: null,
      epoch: 1,
    });
    expect(plan.map((step) => step.title.split(' ')[0])).toEqual([
      'check',
      'back',
      'run',
      'swap',
      'restart',
      'verify',
      'delete',
    ]);
    expect(calls).toEqual([]);
    expect(existsSync(layout.backups)).toBe(false);
  });

  it('stops at the first problem with the built service and touches nothing', async () => {
    const [preflight] = releasePlan({
      layout,
      units: fakeUnits([]),
      name: 'release18',
      built: join(scratch, 'nothing-built'),
      url,
      schema: null,
      epoch: 1,
    });
    await expect(preflight?.run()).rejects.toThrow(ReleaseStepError);
    expect(readFileSync(join(layout.service, 'service.mjs'), 'utf8')).toBe('old service.mjs');
  });
});

describe('the migration check', () => {
  it('runs the real migrations twice on a copy and leaves the live database alone', async () => {
    const empty = new DatabaseSync(layout.database);
    empty.exec('drop table schema_version');
    empty.exec(
      'create table schema_version (version integer primary key, name text not null, applied_at text not null)',
    );
    empty.close();
    const before = readFileSync(layout.database);
    const { from, to } = await checkMigrations(layout);
    expect(from).toBe(0);
    expect(to).toBeGreaterThan(100);
    expect(readFileSync(layout.database).equals(before)).toBe(true);
  }, 60_000);
});
