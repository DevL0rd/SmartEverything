import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HUB_UNIT } from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import {
  backUpRelease,
  builtServiceProblems,
  checkMigrations,
  directorySize,
  freeSpaceProblem,
  hubInstall,
  markBackup,
  pruneBackups,
  pruneReleaseLeftovers,
  ReleaseStepError,
  restoreDatabase,
  restoreService,
  rollbackProblems,
  schemaVersionOf,
  SERVICE_FILES,
  swapService,
  type ReleaseTarget,
} from '../release-hub-files.ts';
import type { TransitionEnvironment } from '../release-hub-transition.ts';
import { failedChecks, releasePlan, rollbackWith } from '../release-hub.ts';
import {
  awaitHub,
  errorEventsSince,
  parseSchemaFlag,
  standaloneHubExecStart,
  verifyHub,
  type Units,
} from '../release-hub-verify.ts';

let scratch = '';
let environment: TransitionEnvironment;
let target: ReleaseTarget;
let data: HubLayout;
let server: Server;
let url = '';
let devicesReply = '[1,2,3]';
let devicesResponses: string[] = [];

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

function logEvent(event: string, timestamp = new Date().toISOString()): void {
  appendFileSync(
    data.system.logs.service,
    `${JSON.stringify({ timestamp, level: 'info', event })}\n`,
  );
}

function fakeUnits(calls: string[], active = true, startEvent = 'service.started'): Units {
  return {
    restart: (unit): void => {
      calls.push(`restart ${unit}`);
      logEvent(startEvent);
    },
    stop: (unit) => calls.push(`stop ${unit}`),
    start: (unit): void => {
      calls.push(`start ${unit}`);
      logEvent(startEvent);
    },
    isActive: () => active,
    activeSince: () => new Date('2026-10-18T00:00:00Z'),
  };
}

beforeEach(async () => {
  devicesReply = '[1,2,3]';
  devicesResponses = [];
  scratch = mkdtempSync(join(tmpdir(), 'release-hub-'));
  data = await testLayout(join(scratch, 'data'));
  environment = {
    bootstrap: join(scratch, 'hub-home'),
    unitDirectory: join(scratch, 'units'),
    reload: (): Promise<void> => Promise.resolve(),
  };
  target = { install: hubInstall(join(scratch, 'install')), data };
  writeService(target.install.service, 'old');
  for (const file of [
    data.system.database.file,
    data.system.keys.ownerToken,
    data.system.logs.service,
  ])
    mkdirSync(dirname(file), { recursive: true });
  writeDatabase(data.system.database.file, 5);
  writeFileSync(data.system.keys.ownerToken, 'secret-token\n');
  writeFileSync(data.system.logs.service, '');
  server = createServer((request, response) => {
    const authorised = request.headers.authorization === 'Bearer secret-token';
    if (request.url === '/privacy') response.writeHead(200).end('page');
    else if (request.url === '/api/devices' && authorised)
      response.writeHead(200).end(devicesResponses.shift() ?? devicesReply);
    else response.writeHead(401).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the release test server to listen on a TCP port');
  }
  url = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(scratch, { recursive: true, force: true });
});

describe('the standalone hub unit', () => {
  it('requires the configured Node executable and hub entry, even if a combined install exists', () => {
    const installed = '/home/fixture/.local/opt/SmartEverything-Hub';
    const node = `${installed}/node/bin/node`;
    const service = `${installed}/resources/service/service.mjs`;
    expect(
      standaloneHubExecStart(
        installed,
        `{ path=${node} ; argv[]=${node} ${service} ; status=0/0 }`,
      ),
    ).toBe(true);
    const desktop = '/home/fixture/.local/opt/SmartEverything/smarteverything';
    expect(
      standaloneHubExecStart(
        installed,
        `{ path=${desktop} ; argv[]=${desktop} ${service} ; status=0/0 }`,
      ),
    ).toBe(false);
    expect(
      standaloneHubExecStart(
        installed,
        `{ path=${node} ; argv[]=${node} ${service} --pair-node ; status=0/0 }`,
      ),
    ).toBe(false);
  });
});

describe('backing up a release', () => {
  it('copies the live service and a consistent copy of the database into a named folder', () => {
    const backup = backUpRelease(target, 'release18', 1234);
    expect(backup).toBe(join(data.backups.releases, 'release18-1234'));
    expect(readFileSync(join(backup, 'service', 'service.mjs'), 'utf8')).toBe('old service.mjs');
    expect(schemaVersionOf(join(backup, 'smarteverything.db'))).toBe(5);
  });

  it('leaves the live database untouched', () => {
    const before = readFileSync(data.system.database.file);
    backUpRelease(target, 'release18', 1);
    expect(readFileSync(data.system.database.file).equals(before)).toBe(true);
  });
});

describe('swapping the service', () => {
  it('puts the built service in place and keeps the replaced one beside it', () => {
    const built = join(scratch, 'built');
    writeService(built, 'new');
    const aside = swapService(target.install, built, 'release18');
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'new service.mjs',
    );
    expect(readFileSync(join(aside, 'service.mjs'), 'utf8')).toBe('old service.mjs');
  });

  it('puts the old service back when the copy fails', () => {
    expect(() => swapService(target.install, join(scratch, 'missing'), 'release18')).toThrow(
      ReleaseStepError,
    );
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'old service.mjs',
    );
  });

  it('names every file a built service lacks', () => {
    const built = join(scratch, 'partial');
    mkdirSync(built);
    writeFileSync(join(built, 'service.mjs'), '');
    expect(builtServiceProblems(built)).toHaveLength(SERVICE_FILES.length - 1);
  });
});

describe('rolling back', () => {
  it('restores and verifies the service and database then removes temporary backups', async () => {
    const backup = backUpRelease(target, 'release18', 1);
    writeService(target.install.service, 'broken');
    writeDatabase(join(scratch, 'newer.db'), 9);
    rmSync(data.system.database.file);
    writeFileSync(data.system.database.file, readFileSync(join(scratch, 'newer.db')));
    const calls: string[] = [];
    await rollbackWith({
      environment,
      target,
      units: fakeUnits(calls),
      backup,
      url,
      withDatabase: true,
      stamp: 's',
    });
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'old service.mjs',
    );
    expect(schemaVersionOf(data.system.database.file)).toBe(5);
    expect(existsSync(`${data.system.database.file}.rolled-back-s`)).toBe(false);
    expect(existsSync(backup)).toBe(false);
    expect(existsSync(`${target.install.service}.rolled-back-s`)).toBe(false);
    expect(calls).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
  });

  it('leaves the database alone unless asked', () => {
    const backup = backUpRelease(target, 'release18', 1);
    restoreService(target.install, backup, 's');
    expect(existsSync(`${data.system.database.file}.rolled-back-s`)).toBe(false);
    restoreDatabase(data, backup, 't');
    expect(existsSync(`${data.system.database.file}.rolled-back-t`)).toBe(true);
  });
});

describe('verifying the hub', () => {
  it('passes when the hub runs, the page answers, the schema matches and devices are listed', async () => {
    const checks = await verifyHub(data, url, fakeUnits([]), 5);
    expect(failedChecks(checks)).toEqual([]);
    expect(checks.map((check) => check.detail)).toContain('3 devices');
  });

  it('passes an authenticated empty device list', async () => {
    devicesReply = '[]';
    const checks = await verifyHub(data, url, fakeUnits([]), 5);
    expect(failedChecks(checks)).toEqual([]);
    expect(checks).toContainEqual({ name: 'owner API', ok: true, detail: '0 devices' });
  });

  it('fails a wrong schema, a stopped unit and a startup failure in the log', async () => {
    writeFileSync(
      data.system.logs.service,
      `${JSON.stringify({ timestamp: '2026-10-18T01:00:00Z', level: 'exception', event: 'service.start_failed' })}\n`,
    );
    const failed = failedChecks(await verifyHub(data, url, fakeUnits([], false), 6)).map(
      (check) => check.name,
    );
    expect(failed).toEqual(['hub unit', 'schema', 'startup errors']);
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

  it('waits for the started line written after the restart and then confirms the page', async () => {
    const logFile = data.system.logs.service;
    logEvent('service.started', '2020-01-01T00:00:00Z');
    const since = new Date();
    const waiting = awaitHub(logFile, url, since);
    logEvent('service.started');
    await expect(waiting).resolves.toBeUndefined();
  });

  it('fails once with the logged cause when the hub reports a failed start', async () => {
    const waiting = awaitHub(data.system.logs.service, url, new Date());
    logEvent('store.migration_failed');
    await expect(waiting).rejects.toThrow('store.migration_failed');
  });

  it('rejects a numeric flag that is not a whole number before any step', () => {
    expect(parseSchemaFlag(undefined)).toBeNull();
    expect(parseSchemaFlag('12')).toBe(12);
    for (const bad of ['abc', '1.5', '-1', '', '1e3']) expect(() => parseSchemaFlag(bad)).toThrow();
  });
});

describe('the release plan', () => {
  it('lists every step in order and runs nothing until a step is run', () => {
    const calls: string[] = [];
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits(calls),
      name: 'release18',
      built: join(scratch, 'built'),
      url,
      schema: null,
      epoch: 1,
    });
    expect(plan.map((step) => step.title.split(' ')[0])).toEqual([
      'check',
      'run',
      'back',
      'swap',
      'restart',
      'verify',
      'delete',
    ]);
    expect(calls).toEqual([]);
    expect(existsSync(data.backups.releases)).toBe(false);
  });

  it('restores the old service when verification throws after swapping', async () => {
    const calls: string[] = [];
    const built = join(scratch, 'built');
    writeService(built, 'new');
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits(calls),
      name: 'release18',
      built,
      url,
      schema: 5,
      epoch: 1,
    });
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    await plan.find((step) => step.title.startsWith('swap'))?.run();
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'new service.mjs',
    );
    devicesResponses = ['{'];
    await expect(plan.find((step) => step.title.startsWith('verify'))?.run()).rejects.toThrow(
      SyntaxError,
    );
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'old service.mjs',
    );
    expect(calls).toEqual([`stop ${HUB_UNIT}`, `stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
  });

  it('stops at the first problem with the built service and touches nothing', async () => {
    const [preflight] = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits([]),
      name: 'release18',
      built: join(scratch, 'nothing-built'),
      url,
      schema: null,
      epoch: 1,
    });
    await expect(preflight?.run()).rejects.toThrow(ReleaseStepError);
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'old service.mjs',
    );
  });
});

describe('the migration check', () => {
  it('runs the real migrations twice on a copy and leaves the live database alone', async () => {
    const empty = new DatabaseSync(data.system.database.file);
    empty.exec('drop table schema_version');
    empty.exec(
      'create table schema_version (version integer primary key, name text not null, applied_at text not null)',
    );
    empty.close();
    const before = readFileSync(data.system.database.file);
    const { from, to } = await checkMigrations(data);
    expect(from).toBe(0);
    expect(to).toBeGreaterThan(100);
    expect(readFileSync(data.system.database.file).equals(before)).toBe(true);
  }, 60_000);
});

function backupWith(
  name: string,
  epoch: number,
  status: 'verified' | 'rolled-back' | null,
): string {
  const directory = join(data.backups.releases, `${name}-${String(epoch)}`);
  mkdirSync(directory, { recursive: true });
  if (status !== null) markBackup(directory, status);
  return directory;
}

describe('pruning after a release', () => {
  it('removes all verified release backups while preserving unmarked manual backups', () => {
    const verified = [1, 2, 3, 4].map((epoch) => backupWith('release', epoch, 'verified'));
    const rolledBack = backupWith('release', 5, 'rolled-back');
    const manual = backupWith('manual', 6, null);
    const removed = pruneBackups(data);
    expect(new Set(removed)).toEqual(new Set([...verified, rolledBack]));
    expect(existsSync(verified[3] ?? '')).toBe(false);
    expect(existsSync(verified[2] ?? '')).toBe(false);
    expect(existsSync(manual)).toBe(true);
  });

  it('deletes replaced and rolled-back leftovers but keeps the current rollback stamp', () => {
    for (const path of [
      `${target.install.service}.old-r1`,
      `${target.install.service}.rolled-back-1`,
      `${target.install.service}.rolled-back-2`,
    ])
      mkdirSync(path);
    writeFileSync(`${data.system.database.file}.rolled-back-1`, 'x');
    writeFileSync(`${data.system.database.file}-wal.rolled-back-2`, 'x');
    pruneReleaseLeftovers(target, '2');
    const names = [
      ...readdirSync(join(target.install.service, '..')),
      ...readdirSync(dirname(data.system.database.file)),
    ];
    expect(names.filter((name) => name.includes('rolled-back') || name.includes('.old-'))).toEqual([
      'service.rolled-back-2',
      'smarteverything.db-wal.rolled-back-2',
    ]);
  });

  it('prunes backups and leftovers only after the release verified', async () => {
    const built = join(scratch, 'built');
    writeService(built, 'new');
    for (const epoch of [1, 2]) backupWith('older', epoch, 'verified');
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits([]),
      name: 'release18',
      built,
      url,
      schema: 5,
      epoch: 10,
    });
    await plan[0]?.run();
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    await plan[3]?.run();
    await plan[5]?.run();
    expect(readFileSync(join(data.backups.releases, 'release18-10', 'status'), 'utf8')).toBe(
      'verified',
    );
    await plan[6]?.run();
    expect(readdirSync(data.backups.releases)).toEqual([]);
    expect(existsSync(`${target.install.service}.old-release18`)).toBe(false);
  });
});

describe('preflight space', () => {
  it('counts the backup of the service directory and the built service as well as the database', () => {
    const built = join(scratch, 'built');
    writeService(built, 'new');
    expect(freeSpaceProblem(target, built)).toBeNull();
    expect(directorySize(target.install.service)).toBeGreaterThan(0);
  });
});

describe('a failed rollback', () => {
  it('reports the original failure together with the rollback failure', async () => {
    const built = join(scratch, 'built');
    writeService(built, 'new');
    let stops = 0;
    const units = {
      ...fakeUnits([]),
      stop: (): void => {
        stops += 1;
        if (stops > 1) throw new Error('stop refused');
      },
    };
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units,
      name: 'release18',
      built,
      url,
      schema: 5,
      epoch: 1,
    });
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    await plan[3]?.run();
    devicesReply = '{';
    const failure = await plan[5]?.run().then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure instanceof AggregateError && failure.message).toContain('stop refused');
    expect(failure instanceof AggregateError && failure.errors[0]).toBeInstanceOf(SyntaxError);
  });

  it('does not restore the database when the migration left the schema unchanged', async () => {
    const built = join(scratch, 'built');
    writeService(built, 'new');
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits([]),
      name: 'release18',
      built,
      url,
      schema: 5,
      epoch: 1,
    });
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    await plan[3]?.run();
    const database = new DatabaseSync(data.system.database.file);
    database.exec("insert into schema_version values (5000, 'live write', 'now')");
    database.close();
    devicesResponses = ['{'];
    await expect(plan[5]?.run()).rejects.toThrow(SyntaxError);
    expect(schemaVersionOf(data.system.database.file)).toBe(5000);
    expect(existsSync(`${data.system.database.file}.rolled-back-1`)).toBe(false);
  });
});

describe('the rollback rehearsal', () => {
  it('passes for a complete backup and names what a broken one lacks', () => {
    const backup = backUpRelease(target, 'release18', 1);
    expect(rollbackProblems(target, backup, true)).toEqual([]);
    rmSync(join(backup, 'service', 'service.mjs'));
    rmSync(join(backup, 'smarteverything.db'));
    expect(rollbackProblems(target, backup, true)).toHaveLength(2);
    expect(rollbackProblems(target, backup, false)).toHaveLength(1);
  });

  it('refuses to stop the hub when the backup is broken', async () => {
    const calls: string[] = [];
    await expect(
      rollbackWith({
        environment,
        target,
        units: fakeUnits(calls),
        backup: join(scratch, 'none'),
        url,
        withDatabase: false,
        stamp: 's',
      }),
    ).rejects.toThrow(ReleaseStepError);
    expect(calls).toEqual([]);
  });
});

function photoRelocation(): {
  readonly original: string;
  readonly moved: string;
  readonly move: () => void;
} {
  const rootId = '11111111-1111-4111-8111-111111111111';
  const itemId = '22222222-2222-4222-8222-222222222222';
  const root = join(scratch, 'personal-drive');
  const original = join(root, 'Camera Roll', 'owner', 'video.mp4');
  const moved = join(root, 'Photos', 'video.mp4');
  mkdirSync(dirname(original), { recursive: true });
  mkdirSync(dirname(moved), { recursive: true });
  writeFileSync(original, 'original video bytes');
  const database = new DatabaseSync(data.system.database.file);
  database.exec(`delete from schema_version; insert into schema_version values (201, 'photos', 'now');
    create table drive_roots(id text, path text, kind text, scope text);
    create table drive_items(id text, root_id text, rel_path text);`);
  database
    .prepare('insert into drive_roots values(?, ?, ?, ?)')
    .run(rootId, root, 'managed', 'person');
  database
    .prepare('insert into drive_items values(?, ?, ?)')
    .run(itemId, rootId, 'Camera Roll/owner/video.mp4');
  database.close();
  return {
    original,
    moved,
    move: (): void => {
      const stat = statSync(original, { bigint: true });
      const receipt = join(root, '.smarteverything/migrations/photos-folder-201', `${itemId}.json`);
      mkdirSync(dirname(receipt), { recursive: true });
      writeFileSync(
        receipt,
        JSON.stringify({
          kind: 'file',
          rootId,
          itemId,
          fromPath: 'Camera Roll/owner/video.mp4',
          toPath: 'Photos/video.mp4',
          dev: String(stat.dev),
          ino: String(stat.ino),
          bytes: Number(stat.size),
          mtimeNs: String(stat.mtimeNs),
          sha256: null,
        }),
      );
      renameSync(original, moved);
      const live = new DatabaseSync(data.system.database.file);
      live.prepare('update drive_items set rel_path=? where id=?').run('Photos/video.mp4', itemId);
      live.close();
    },
  };
}

function expectPhotoRestored(paths: { readonly original: string; readonly moved: string }): void {
  expect(readFileSync(paths.original, 'utf8')).toBe('original video bytes');
  expect(existsSync(paths.moved)).toBe(false);
  const database = new DatabaseSync(data.system.database.file, { readOnly: true });
  try {
    expect(database.prepare('select rel_path from drive_items').get()).toEqual({
      rel_path: 'Camera Roll/owner/video.mp4',
    });
  } finally {
    database.close();
  }
  expect(schemaVersionOf(data.system.database.file)).toBe(201);
}

describe('same-schema Photos rollback', () => {
  it('restores retained201 filesystem receipts and database paths on automatic release failure', async () => {
    const photos = photoRelocation();
    const built = join(scratch, 'built');
    writeService(built, 'new');
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits([]),
      name: 'photos',
      built,
      url,
      schema: 201,
      epoch: 12,
    });
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    photos.move();
    await plan.find((step) => step.title.startsWith('swap'))?.run();
    devicesResponses = ['{'];
    await expect(plan.find((step) => step.title.startsWith('verify'))?.run()).rejects.toThrow(
      SyntaxError,
    );
    expectPhotoRestored(photos);
    expect(existsSync(join(data.backups.releases, 'photos-12'))).toBe(false);
  });

  it('rolls back offline preparation failures before starting the prior service', async () => {
    const photos = photoRelocation();
    const built = join(scratch, 'built');
    writeService(built, 'new');
    const base = fakeUnits([]);
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      name: 'photos',
      built,
      url,
      schema: 201,
      epoch: 12,
      units: {
        ...base,
        start: (unit) => {
          expectPhotoRestored(photos);
          base.start(unit);
        },
      },
      prepareData: () => {
        photos.move();
        return Promise.reject(new Error('preparation refused'));
      },
    });
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    await plan.find((step) => step.title.startsWith('swap'))?.run();
    await expect(plan[4]?.run()).rejects.toThrow('preparation refused');
    expectPhotoRestored(photos);
    expect(existsSync(join(data.backups.releases, 'photos-12'))).toBe(false);
  });

  it('does not start normal service until offline preparation completes', async () => {
    const photos = photoRelocation();
    const calls: string[] = [];
    const built = join(scratch, 'built');
    writeService(built, 'new');
    let complete: () => void = () => undefined;
    const preparation = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const plan = releasePlan({
      environment,
      transition: null,
      target,
      units: fakeUnits(calls),
      name: 'photos',
      built,
      url,
      schema: 201,
      epoch: 12,
      prepareData: () => preparation,
    });
    await plan.find((step) => step.title.startsWith('back up'))?.run();
    await plan.find((step) => step.title.startsWith('swap'))?.run();
    const starting = plan[4]?.run();
    expect(calls).toEqual([`stop ${HUB_UNIT}`]);
    expect(readFileSync(photos.original, 'utf8')).toBe('original video bytes');
    complete();
    await starting;
    expect(calls).toEqual([`stop ${HUB_UNIT}`, `start ${HUB_UNIT}`]);
  });

  it('restores matching database paths for filesystem receipts even without the manual database flag', async () => {
    const photos = photoRelocation();
    const backup = backUpRelease(target, 'photos', 12);
    photos.move();
    await rollbackWith({
      target,
      environment,
      units: fakeUnits([]),
      backup,
      url,
      withDatabase: false,
      stamp: 'photos',
    });
    expectPhotoRestored(photos);
    expect(existsSync(backup)).toBe(false);
  });
});
