import { serviceIdentity } from './self-update-service-identity.ts';
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { basename, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HUB_UNIT } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import { message, type Flow, type WatchdogOptions } from './self-update-watchdog-engine.ts';
import { writeLedger } from './self-update-ledger.ts';

const log = new Logger('tool.hub-update-watchdog');

const SCHEMA_ROW = z.object({ version: z.number().int().nullable() });
const RESTART_COUNT = z.string().regex(/^\d+$/u).transform(Number).pipe(z.int().nonnegative());

function systemctl(verb: string, unit: string): void {
  const outcome = spawnSync('systemctl', ['--user', verb, unit], { encoding: 'utf8' });
  if (outcome.status !== 0) throw new Error(`systemctl --user ${verb} ${unit} failed`);
}

function property(unit: string, name: string): string {
  const result = spawnSync('systemctl', ['--user', 'show', unit, `--property=${name}`, '--value'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Could not read ${name} of ${unit}`);
  return result.stdout.trim();
}

function schemaOf(file: string): number | null {
  try {
    const opened = new DatabaseSync(file, { readOnly: true });
    try {
      return SCHEMA_ROW.parse(
        opened.prepare('select max(version) as version from schema_version').get(),
      ).version;
    } finally {
      opened.close();
    }
  } catch (cause) {
    log.debug('schema.unavailable', () => ({ reason: message(cause) }));
    return null;
  }
}

async function answer(url: string, token: string | null): Promise<Response | null> {
  try {
    const headers = token === null ? {} : { authorization: `Bearer ${token}` };
    return await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch (cause) {
    log.debug('health.unavailable', () => ({ reason: message(cause) }));
    return null;
  }
}

function count(options: WatchdogOptions, layout: HubLayout): () => Promise<number | null> {
  return async () => {
    const file = layout.system.keys.ownerToken;
    if (!existsSync(file)) return null;
    const reply = await answer(`${options.url}/api/devices`, readFileSync(file, 'utf8').trim());
    return reply?.ok === true ? z.array(z.unknown()).parse(await reply.json()).length : null;
  };
}

function snapshotDatabase(from: string, to: string): void {
  const staged = `${to}.next`;
  rmSync(staged, { force: true });
  const source = new DatabaseSync(from, { readOnly: true });
  try {
    source.prepare('vacuum into $path').run({ path: staged });
  } finally {
    source.close();
  }
  renameSync(staged, to);
}

const storage: Flow['storage'] = {
  treeIdentity: serviceIdentity,
  exists: existsSync,
  read: (path) => readFileSync(path, 'utf8'),
  write: (path: string, text: string): void => {
    writeFileSync(path, text);
  },
  makeDirectory: (path: string): void => {
    mkdirSync(path, { recursive: true });
  },
  replaceTree: (from: string, to: string): void => {
    if (!existsSync(from)) throw new Error(`${from} is missing, so ${to} cannot be restored`);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  },
  snapshotDatabase,
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

function subscribe(layout: HubLayout): Flow['events'] {
  let pending = false;
  let wake: (() => void) | null = null;
  const signal = (): void => {
    if (wake === null) pending = true;
    else wake();
  };
  const ready = layout.system.run.ready;
  const files = watch(dirname(ready), (_kind, name) => {
    if (name === basename(ready)) signal();
  });
  const unit = spawn(
    'journalctl',
    [
      '--user',
      '--follow',
      '--lines=0',
      '--output=cat',
      '--identifier=systemd',
      `--unit=${HUB_UNIT}`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  unit.stdout.on('data', signal);
  return {
    next: (timeoutMs) =>
      new Promise((resolve) => {
        if (pending) {
          pending = false;
          resolve(true);
          return;
        }
        const timer = setTimeout(() => {
          wake = null;
          resolve(false);
        }, timeoutMs);
        wake = (): void => {
          clearTimeout(timer);
          wake = null;
          resolve(true);
        };
      }),
    close: (): void => {
      files.close();
      unit.kill();
    },
  };
}

export function flowOf(options: WatchdogOptions): Flow {
  const layout = dataLayoutOf(options.data);
  return {
    options,
    now: () => new Date(),
    events: subscribe(layout),
    units: {
      act: systemctl,
      active: (unit) => property(unit, 'ActiveState') === 'active',
      restarts: (unit) => RESTART_COUNT.parse(property(unit, 'NRestarts')),
      since: (unit) => new Date(Date.parse(property(unit, 'ActiveEnterTimestamp')) || 0),
    },
    health: {
      status: async (url) => (await answer(`${url}/privacy`, null))?.status ?? null,
      devices: count(options, layout),
      schema: schemaOf,
    },
    storage,
    recordLedger: (ledger: Parameters<typeof writeLedger>[1]): void => {
      writeLedger(options.ledger, ledger);
    },
    note: (event: string, fields: Readonly<Record<string, unknown>>): void => {
      const file = layout.system.logs.hubUpdateWatchdog;
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(
        file,
        `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event, ...fields })}\n`,
      );
    },
  };
}
