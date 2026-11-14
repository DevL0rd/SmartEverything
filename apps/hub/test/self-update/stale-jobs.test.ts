import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HUB_UPDATE_LEDGER_FILE, type HubUpdateRelease } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import { settleStaleUpdateJobs } from '../../src/self-update/stale-jobs';
import { testLayout } from '../support/test-layout';

const AT = '2026-11-08T08:07:41.704Z';
const NOW = new Date('2026-11-14T18:30:00.000Z');
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let scratch: string;
let layout: HubLayout;
let work: string;
let holder: ChildProcess | undefined;

function job(n: number, action: string, phase: string, result: object = {}): object {
  return {
    runId: ID(n),
    action,
    phase,
    input: {},
    identity: null,
    runtime: null,
    detail: null,
    checks: [],
    result,
    steps: [],
    startedAt: AT,
    updatedAt: AT,
  };
}

function release(n: number, phase: HubUpdateRelease['phase']): HubUpdateRelease {
  return {
    runId: ID(n),
    phase,
    notes: 'Notes',
    build: null,
    backup: null,
    url: 'http://127.0.0.1:7880',
    healthFile: '/tmp/health',
    watchdogUnit: 'unit',
    startingSchema: null,
    changedDatabase: false,
    installs: [],
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

async function put(n: number, value: object): Promise<void> {
  await writeFile(join(work, 'jobs', `${ID(n)}.json`), JSON.stringify(value));
}

const JOB_VIEW = z.object({
  phase: z.string(),
  detail: z.string().nullable(),
  updatedAt: z.string(),
});

async function read(n: number): Promise<z.infer<typeof JOB_VIEW>> {
  return JOB_VIEW.parse(JSON.parse(await readFile(join(work, 'jobs', `${ID(n)}.json`), 'utf8')));
}

async function holdLock(file: string): Promise<void> {
  holder = spawn('flock', ['--exclusive', file, 'sh', '-c', 'printf ready; exec cat >/dev/null'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const stdout = holder.stdout;
  if (stdout === null) throw new Error('the lock holder has no output');
  await once(stdout, 'data');
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'stale-jobs-'));
  layout = await testLayout(scratch);
  work = layout.system.updates.selfUpdate;
  await mkdir(join(work, 'jobs'), { recursive: true });
});

afterEach(async () => {
  holder?.stdin?.end();
  if (holder !== undefined) await once(holder, 'close');
  holder = undefined;
  await rm(scratch, { recursive: true, force: true });
});

it('marks build jobs whose process is gone as failed with a reason and keeps finished ones', async () => {
  await put(1, job(1, 'ui', 'running'));
  await put(2, job(2, 'app', 'planned'));
  await put(3, job(3, 'app', 'published'));
  await put(4, job(4, 'file', 'running'));
  const settled = await settleStaleUpdateJobs(layout, () => NOW);
  expect(settled.map((entry) => entry.runId).sort()).toEqual([ID(1), ID(2), ID(4)]);
  const failed = await read(1);
  expect(failed.phase).toBe('failed');
  expect(failed.updatedAt).toBe(NOW.toISOString());
  expect(failed.detail).toContain('ended unfinished');
  expect((await read(3)).phase).toBe('published');
});

it('leaves a build job alone while its executor holds the lock', async () => {
  await put(1, job(1, 'ui', 'running'));
  await holdLock(join(work, 'executor.lock'));
  expect(await settleStaleUpdateJobs(layout, () => NOW)).toEqual([]);
  expect((await read(1)).phase).toBe('running');
});

it('settles a hub job from its release in the ledger', async () => {
  await put(1, job(1, 'hub', 'running', { runId: ID(11) }));
  await put(2, job(2, 'hub', 'running', { runId: ID(12) }));
  await put(3, job(3, 'hub', 'running', { runId: ID(13) }));
  await put(4, job(4, 'hub', 'running', { runId: ID(14) }));
  await writeFile(
    join(work, HUB_UPDATE_LEDGER_FILE),
    JSON.stringify({
      releases: [release(11, 'done'), release(12, 'reverted'), release(13, 'verifying')],
    }),
  );
  await settleStaleUpdateJobs(layout, () => NOW);
  expect((await read(1)).phase).toBe('applied');
  expect((await read(2)).phase).toBe('failed');
  expect((await read(2)).detail).toContain('reverted');
  expect((await read(3)).phase).toBe('running');
  expect((await read(4)).phase).toBe('failed');
  expect((await read(4)).detail).toContain('missing');
});

it('removes publication scratch folders left by a killed build but not while one runs', async () => {
  await mkdir(join(work, 'publication-yk82rn'));
  await writeFile(join(work, 'publication-yk82rn', 'partial.apk'), 'x');
  await holdLock(join(work, 'executor.lock'));
  await settleStaleUpdateJobs(layout, () => NOW);
  expect(await readdir(work)).toContain('publication-yk82rn');
  holder?.stdin?.end();
  if (holder !== undefined) await once(holder, 'close');
  holder = undefined;
  await settleStaleUpdateJobs(layout, () => NOW);
  expect(await readdir(work)).not.toContain('publication-yk82rn');
});
