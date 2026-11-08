import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HUB_UNIT } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  layoutFromNames,
  LOCATION_FILE,
  readLocation,
  V1_NAMES,
  writeMarker,
  type HubLayout,
} from '../../apps/hub/src/data-layout/index.ts';
import { runV1Renames } from '../../apps/hub/src/data-layout/migrate-v1/renames.ts';
import {
  HUB_ENTRIES,
  writeLiveListing,
} from '../../apps/hub/test/data-layout/fixtures/live-listing.ts';
import {
  releaseSceneOf,
  rollbackPreflight,
  SERVICE_FILES,
  type ReleaseTarget,
} from '../release-hub-files.ts';
import { releasePlan, rollbackWith, type ReleaseOptions } from '../release-hub.ts';
import {
  legacyLayoutOf,
  type Transition,
  type TransitionEnvironment,
} from '../release-hub-transition.ts';
import type { Units } from '../release-hub-verify.ts';

const OLD_UNIT = '[Service]\nExecStart=/old/hub\n';
const NAME = 'release20';
const EPOCH = 1000;
const UNIT_SPEC = {
  install: '/install',
  node: 'node/bin/node',
  entry: 'resources/service/service.mjs',
};

let scratch = '';
let root = '';
let after: HubLayout;
let legacy: HubLayout;
let target: ReleaseTarget;
let transition: Transition;
let environment: TransitionEnvironment;
let events: string[];
let pending: Promise<void>[];
let server: Server;
let url = '';
let atRestart: { readonly pointer: string; readonly unit: string } | null;

function writeService(directory: string, marker: string): void {
  mkdirSync(directory, { recursive: true });
  for (const file of SERVICE_FILES) writeFileSync(join(directory, file), `${marker} ${file}`);
}

function writeDatabase(path: string, versions: readonly number[]): void {
  const database = new DatabaseSync(path);
  database.exec(
    'create table schema_version (version integer primary key, name text not null, applied_at text not null)',
  );
  for (const version of versions)
    database.exec(`insert into schema_version values (${String(version)}, 'x', 'now')`);
  database.close();
}

function startedLine(logFile: string): void {
  mkdirSync(join(logFile, '..'), { recursive: true });
  appendFileSync(
    logFile,
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event: 'service.started' })}\n`,
  );
}

async function hubMigrates(): Promise<void> {
  await runV1Renames(root);
  const location = await readLocation(environment.bootstrap);
  await writeMarker(after, {
    version: 1,
    rootId: location.rootId,
    createdAt: new Date().toISOString(),
    state: 'active',
  });
  const database = new DatabaseSync(after.system.database.file);
  database.exec("insert into schema_version values (9, 'sql migration', 'now')");
  database.close();
  startedLine(after.system.logs.service);
}

function fakeUnits(startLog: () => string): Units {
  return {
    restart: (): void => {
      events.push('restart');
      atRestart = {
        pointer: existsSync(join(environment.bootstrap, LOCATION_FILE))
          ? readFileSync(join(environment.bootstrap, LOCATION_FILE), 'utf8')
          : '',
        unit: readFileSync(join(environment.unitDirectory, 'smarteverything.service'), 'utf8'),
      };
      pending.push(hubMigrates());
    },
    stop: () => events.push('stop'),
    start: (): void => {
      events.push('start');
      startedLine(startLog());
    },
    isActive: () => true,
    activeSince: () => new Date(0),
  };
}

function options(units: Units): ReleaseOptions {
  return {
    target,
    environment,
    transition,
    units,
    name: NAME,
    built: join(scratch, 'built'),
    url,
    schema: null,
    epoch: EPOCH,
  };
}

async function runRelease(): Promise<void> {
  const plan = releasePlan(options(fakeUnits(() => after.system.logs.service)));
  for (const step of plan) if (!step.title.startsWith('run')) await step.run();
  await Promise.all(pending);
}

beforeEach(async () => {
  events = [];
  pending = [];
  atRestart = null;
  scratch = mkdtempSync(join(tmpdir(), 'release-transition-'));
  root = join(scratch, 'data');
  mkdirSync(root);
  await writeLiveListing(root);
  for (const name of ['smarteverything.db-wal', 'smarteverything.db-shm'])
    rmSync(join(root, name), { force: true });
  rmSync(join(root, 'smarteverything.db'));
  writeDatabase(join(root, 'smarteverything.db'), [7]);
  writeFileSync(join(root, 'owner-token'), 'secret-token\n');
  writeFileSync(join(root, 'service.log'), '');
  legacy = legacyLayoutOf(root);
  after = layoutFromNames(root, V1_NAMES, {});
  environment = {
    bootstrap: join(scratch, 'hub-home'),
    unitDirectory: join(scratch, 'units'),
    reload: (): Promise<void> => {
      events.push('reload');
      return Promise.resolve();
    },
  };
  mkdirSync(environment.unitDirectory);
  writeFileSync(join(environment.unitDirectory, 'smarteverything.service'), OLD_UNIT);
  target = { install: { service: join(scratch, 'install', 'resources', 'service') }, data: legacy };
  transition = { after, unit: UNIT_SPEC };
  writeService(target.install.service, 'old');
  writeService(join(scratch, 'built'), 'new');
  server = createServer((request, response) => {
    if (request.url === '/privacy') response.writeHead(200).end('page');
    else if (
      request.url === '/api/devices' &&
      request.headers.authorization === 'Bearer secret-token'
    )
      response.writeHead(200).end('[1]');
    else response.writeHead(401).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  url = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(scratch, { recursive: true, force: true });
});

describe('choosing the release scene', () => {
  it('plans a transition on the pre-v1 layout when the data folder has no marker', () => {
    const scene = releaseSceneOf('/install', root);
    expect(scene.transition).not.toBeNull();
    expect(scene.target.data.system.database.file).toBe(join(root, 'smarteverything.db'));
    expect(scene.transition?.unit.install).toBe('/install');
  });

  it('plans no transition once the folder carries the v1 marker', async () => {
    await writeMarker(after, {
      version: 1,
      rootId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      state: 'active',
    });
    expect(releaseSceneOf('/install', root).transition).toBeNull();
  });
});

describe('the transition release', () => {
  it('reports the pointer and unit step in the restart step of a dry run', () => {
    const plan = releasePlan(options(fakeUnits(() => '')));
    const restart = plan.find((step) => step.title.includes(`restart ${HUB_UNIT}`));
    expect(restart?.title).toContain('pending-v1 pointer');
    expect(restart?.title).toContain('reload systemd');
    expect(existsSync(environment.bootstrap)).toBe(false);
  });

  it('saves the old unit in the backup, then writes pointer and unit and reloads before the restart', async () => {
    await runRelease();
    expect(events).toEqual(['reload', 'restart']);
    expect(JSON.parse(atRestart?.pointer ?? 'null')).toMatchObject({
      root,
      state: 'pending-v1',
    });
    expect(atRestart?.unit).toContain('WorkingDirectory=%E/SmartEverything-Hub');
    expect(atRestart?.unit).not.toContain('SMARTEVERYTHING_DATA_DIRECTORY');
    const backup = join(after.backups.releases, `${NAME}-${String(EPOCH)}`);
    expect(readFileSync(join(backup, 'transition', 'smarteverything.service'), 'utf8')).toBe(
      OLD_UNIT,
    );
    expect(readFileSync(join(backup, 'status'), 'utf8')).toBe('verified');
  });
});

describe('rolling back across v1', () => {
  async function released(): Promise<string> {
    await runRelease();
    events.length = 0;
    return join(root, 'release-backups', `${NAME}-${String(EPOCH)}`);
  }

  function rollback(backup: string, withDatabase: boolean): Promise<void> {
    const units = fakeUnits(() => legacy.system.logs.service);
    return rollbackWith({
      target: { install: target.install, data: after },
      environment,
      units,
      backup,
      url,
      withDatabase,
      stamp: 's',
    });
  }

  it('restores names, unit, pointer absence, service and database from the pre-v1 backup path', async () => {
    const backup = await released();
    expect(existsSync(backup)).toBe(false);
    await rollback(backup, true);
    expect(events).toEqual(['stop', 'reload', 'start']);
    for (const entry of HUB_ENTRIES.filter((one) => !/-(wal|shm)$/u.test(one.legacy))) {
      expect(existsSync(join(root, ...entry.legacy.split('/')))).toBe(true);
      expect(existsSync(join(root, ...entry.v1.split('/')))).toBe(false);
    }
    expect(existsSync(join(root, 'layout.json'))).toBe(false);
    expect(existsSync(join(root, 'system'))).toBe(false);
    expect(existsSync(environment.bootstrap)).toBe(false);
    expect(readFileSync(join(environment.unitDirectory, 'smarteverything.service'), 'utf8')).toBe(
      OLD_UNIT,
    );
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'old service.mjs',
    );
    const database = new DatabaseSync(legacy.system.database.file, { readOnly: true });
    expect(database.prepare('select max(version) as v from schema_version').get()).toEqual({
      v: 7,
    });
    database.close();
    expect(existsSync(join(root, 'release-backups', `${NAME}-${String(EPOCH)}`))).toBe(true);
  });

  it('accepts the backup at its v1 location as well', async () => {
    await released();
    await rollback(join(after.backups.releases, `${NAME}-${String(EPOCH)}`), true);
    expect(existsSync(join(root, 'smarteverything.db'))).toBe(true);
    expect(existsSync(environment.bootstrap)).toBe(false);
  });

  it('refuses without --with-database and changes nothing', async () => {
    const backup = await released();
    const { problems } = rollbackPreflight(
      { install: target.install, data: after },
      backup,
      false,
      environment,
    );
    expect(problems.join(' ')).toContain('--with-database');
    await expect(rollback(backup, false)).rejects.toThrow('--with-database');
    expect(events).toEqual([]);
    expect(existsSync(join(root, 'layout.json'))).toBe(true);
    expect(existsSync(join(environment.bootstrap, LOCATION_FILE))).toBe(true);
  });

  it('puts the old unit back and removes the pointer when the hub never migrated', async () => {
    const units: Units = {
      ...fakeUnits(() => legacy.system.logs.service),
      restart: () => {
        throw new Error('restart refused');
      },
    };
    const plan = releasePlan(options(units));
    await plan[1]?.run();
    await plan[3]?.run();
    await expect(plan[4]?.run()).rejects.toThrow('restart refused');
    expect(events).toEqual(['reload', 'stop', 'reload', 'start']);
    expect(readFileSync(join(environment.unitDirectory, 'smarteverything.service'), 'utf8')).toBe(
      OLD_UNIT,
    );
    expect(existsSync(environment.bootstrap)).toBe(false);
    expect(existsSync(join(root, 'system'))).toBe(false);
    expect(readFileSync(join(target.install.service, 'service.mjs'), 'utf8')).toBe(
      'old service.mjs',
    );
  });
});
