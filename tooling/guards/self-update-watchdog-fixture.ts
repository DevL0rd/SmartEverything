import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  HUB_UPDATE_LEDGER,
  HUB_UNIT,
  type HubUpdatePhase,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { afterEach, beforeEach, vi } from 'vitest';
import { hubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { selfUpdatePaths } from '../self-update-files.ts';
import { record, type Flow, type WatchdogOptions } from '../self-update-watchdog-engine.ts';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

export const AT = '2026-11-05T00:00:00.000Z';

export const OLD = 'old-release';

export const NEW = 'new-release';

const STARTING_SCHEMA = 2;

const DEVICES = 7;

export const EXPECTED = `schema:${String(STARTING_SCHEMA)}`;

interface Start {
  readonly phase: HubUpdatePhase;
  readonly up: boolean;
  readonly migrates?: number;
  readonly refuses?: boolean;
  readonly devices?: number | null;
  readonly oldUp?: boolean;
}

interface World {
  readonly flow: Flow;
  readonly actions: string[];
  readonly polls: () => number;
  readonly service: () => string;
  readonly database: () => string;
  readonly ledger: () => HubUpdateRelease | undefined;
}

interface Behaviour {
  readonly migration: number;
  readonly devices: number | null;
  readonly failure: string | null;
  readonly starts: boolean;
}

type Running = { readonly release: string; readonly since: number } | null;

class Machine {
  constructor(public running: Running) {}

  setHub(running: Running): void {
    this.running = running;
  }
}

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'watchdog-'));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date(AT));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(directory, { recursive: true, force: true });
});

type TestPaths = Readonly<
  Record<
    | 'install'
    | 'service'
    | 'build'
    | 'database'
    | 'backup'
    | 'ledger'
    | 'health'
    | 'log'
    | 'data'
    | 'watchdog',
    string
  >
>;

export function paths(): TestPaths {
  const data = join(directory, 'data');
  const layout = hubLayout(data, {});
  const update = selfUpdatePaths(layout);
  return {
    install: join(directory, 'install'),
    service: join(directory, 'install', 'resources', 'service'),
    build: join(directory, 'build', 'service'),
    database: layout.system.database.file,
    backup: join(layout.backups.releases, 'hub-1'),
    ledger: update.ledger,
    health: update.health,
    log: layout.system.logs.service,
    data,
    watchdog: join(update.work, `${RUN_ID}-watchdog`),
  };
}

export function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function copyTree(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  if (!existsSync(from)) throw new Error(`${from} is missing, so ${to} cannot be restored`);
  cpSync(from, to, { recursive: true });
}

function schemaOf(file: string): number | null {
  if (!existsSync(file)) return null;
  const [header] = readFileSync(file, 'utf8').split('\n');
  return header === undefined ? null : Number(header.slice('schema:'.length));
}

function releaseOf(phase: HubUpdatePhase): HubUpdateRelease {
  const files = paths();
  return {
    runId: RUN_ID,
    phase,
    notes: 'a test release',
    build: files.build,
    backup: files.backup,
    url: 'http://127.0.0.1:7880',
    healthFile: files.health,
    watchdogUnit: files.watchdog,
    startingSchema: STARTING_SCHEMA,
    changedDatabase: false,
    installs: [files.install],
    checks: [],
    failedChecks: [],
    reason: null,
    interrupted: false,
    revision: 0,
    startedAt: AT,
    updatedAt: AT,
    finishedAt: null,
  };
}

function laidOut(start: Start): void {
  const files = paths();
  write(join(files.build, 'service.mjs'), NEW);
  write(join(files.backup, 'service', 'service.mjs'), OLD);
  write(join(files.backup, 'smarteverything.db'), EXPECTED);
  write(files.database, EXPECTED);
  write(files.watchdog, 'bundle');
  write(join(files.service, 'service.mjs'), start.phase === 'restarting' ? NEW : OLD);
}

function optionsOf(): WatchdogOptions {
  const files = paths();
  return {
    runId: RUN_ID,
    url: 'http://127.0.0.1:7880',
    service: files.service,
    install: files.install,
    database: files.database,
    backup: files.backup,
    ledger: files.ledger,
    health: files.health,
    data: files.data,
    startingSchema: STARTING_SCHEMA,
    expectedSchema: STARTING_SCHEMA,
    holdSeconds: 0,
    retryUnrecoverable: false,
  };
}

function newBehaviour(start: Start): Behaviour {
  const refuses = start.refuses === true;
  return {
    migration: refuses ? STARTING_SCHEMA : (start.migrates ?? STARTING_SCHEMA),
    devices: start.devices === undefined ? DEVICES : start.devices,
    failure: refuses ? 'hub.start_failed' : null,
    starts: !refuses,
  };
}

function oldBehaviour(start: Start): Behaviour {
  return {
    migration: STARTING_SCHEMA,
    devices: DEVICES,
    failure: null,
    starts: start.oldUp !== false,
  };
}

function behaviourOf(start: Start, release: string): Behaviour {
  return release === NEW ? newBehaviour(start) : oldBehaviour(start);
}

function booted(start: Start, release: string): Machine['running'] {
  const files = paths();
  const behaviour = behaviourOf(start, release);
  vi.setSystemTime(Date.now() + 1);
  if (!behaviour.starts) {
    const at = new Date(Date.now()).toISOString();
    write(
      files.log,
      `${JSON.stringify({ timestamp: at, level: 'error', event: behaviour.failure ?? 'hub.start_failed' })}\n`,
    );
    return null;
  }
  if (schemaOf(files.database) !== behaviour.migration)
    write(files.database, `schema:${String(behaviour.migration)}`);
  return { release, since: Date.now() };
}

function unitsOf(
  machine: Machine,
  start: Start,
  files: TestPaths,
  actions: string[],
): Flow['units'] {
  return {
    act: (verb: Parameters<Flow['units']['act']>[0], unit: string): void => {
      actions.push(`${verb} ${unit}`);
      if (unit !== HUB_UNIT) throw new Error(`Unexpected unit: ${unit}`);
      if (verb === 'stop') machine.setHub(null);
      else machine.setHub(booted(start, readFileSync(join(files.service, 'service.mjs'), 'utf8')));
    },
    active: (unit) => unit === HUB_UNIT && machine.running !== null,
    restarts: () => 0,
    since: (unit) => new Date(unit === HUB_UNIT ? (machine.running?.since ?? 0) : 0),
  };
}

function storageOf(machine: Machine): Flow['storage'] {
  return {
    exists: existsSync,
    read: (path) => readFileSync(path, 'utf8'),
    write: (path: string, text: string): void => {
      write(path, text);
    },
    makeDirectory: (path) => mkdirSync(path, { recursive: true }),
    replaceTree: copyTree,
    snapshotDatabase: (from: string, to: string): void => {
      if (machine.running !== null) throw new Error('snapshot while writing');
      copyFileSync(from, to);
    },
    renameFile: renameSync,
    copyFile: (from: string, to: string): void => {
      copyFileSync(from, to);
    },
    removeFile: (path: string): void => {
      rmSync(path, { force: true });
    },
    removeAny: (path: string): void => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export function world(start: Start): World {
  const files = paths();
  laidOut(start);
  const machine = new Machine(start.up ? { release: OLD, since: Date.parse(AT) } : null);
  const actions: string[] = [];
  let polls = 0;
  const flow: Flow = {
    options: optionsOf(),
    now: () => new Date(Date.now()),
    events: {
      next: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
        return false;
      },
      close: (): void => undefined,
    },
    units: unitsOf(machine, start, files, actions),
    health: {
      status: () => {
        polls += 1;
        return Promise.resolve(machine.running === null ? 503 : 200);
      },
      devices: () =>
        Promise.resolve(
          machine.running === null ? null : behaviourOf(start, machine.running.release).devices,
        ),
      schema: schemaOf,
    },
    storage: storageOf(machine),
    note: () => undefined,
  };
  record(flow, releaseOf(start.phase));
  return {
    flow,
    actions,
    polls: () => polls,
    service: () => readFileSync(join(files.service, 'service.mjs'), 'utf8'),
    database: () => readFileSync(files.database, 'utf8'),
    ledger: () =>
      HUB_UPDATE_LEDGER.parse(JSON.parse(readFileSync(files.ledger, 'utf8'))).releases[0],
  };
}
