import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skippedNotice } from './output.ts';
import { run, runGated } from './process.ts';
import { env } from 'node:process';

const BACKSTOP_MS = 20_000;
const dir = mkdtempSync(join(tmpdir(), 'hook-gate-'));
const slow = join(dir, 'slow.sh');
const spawner = join(dir, 'spawner.sh');
const niceness = join(dir, 'niceness.sh');
const previous = env['HOOK_GATE_DIR'];

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
}

async function pidFrom(path: string): Promise<number> {
  for (let tries = 0; tries < 100 && !existsSync(path); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return Number(readFileSync(path, 'utf8').trim());
}

beforeAll(() => {
  env['HOOK_GATE_DIR'] = dir;
  writeFileSync(slow, '#!/bin/sh\nsleep "$1"\necho done\n');
  writeFileSync(spawner, '#!/bin/sh\nsleep 300 &\necho $! > "$1"\nwait\n');
  writeFileSync(niceness, '#!/bin/sh\nnice\n');
  chmodSync(niceness, 0o755);
  chmodSync(slow, 0o755);
  chmodSync(spawner, 0o755);
});

afterAll(() => {
  if (previous === undefined) delete env['HOOK_GATE_DIR'];
  else env['HOOK_GATE_DIR'] = previous;
  rmSync(dir, { recursive: true, force: true });
});

describe('machine-wide gate', () => {
  it('runs one check and skips the other while the gate is busy', async () => {
    const first = runGated({
      name: 'tsc',
      binary: slow,
      args: ['1.5'],
      timeoutMs: 20_000,
      backstopMs: BACKSTOP_MS,
      waitMs: 200,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const second = await runGated({
      name: 'tsc',
      binary: slow,
      args: ['0'],
      timeoutMs: 20_000,
      backstopMs: BACKSTOP_MS,
      waitMs: 200,
    });
    expect(second.skipped).toContain('another tsc check is running');
    expect(second.code).toBeNull();
    expect(second.timedOut).toBe(false);
    const done = await first;
    expect(done.code).toBe(0);
    expect(done.skipped).toBeUndefined();
    expect(done.stdout).toBe('done\n');
  });

  it('coalesces an identical check that is already running', async () => {
    const first = runGated({
      name: 'vitest',
      binary: slow,
      args: ['1.5'],
      timeoutMs: 20_000,
      backstopMs: BACKSTOP_MS,
      waitMs: 5000,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const second = await runGated({
      name: 'vitest',
      binary: slow,
      args: ['1.5'],
      timeoutMs: 20_000,
      backstopMs: BACKSTOP_MS,
      waitMs: 5000,
    });
    expect(second.skipped).toContain('identical vitest check is already queued or running');
    expect((await first).code).toBe(0);
  });

  it('lets different kinds run at the same time', async () => {
    const results = await Promise.all([
      runGated({
        name: 'tsc',
        binary: slow,
        args: ['0.5'],
        timeoutMs: 20_000,
        backstopMs: BACKSTOP_MS,
        waitMs: 200,
      }),
      runGated({
        name: 'eslint',
        binary: slow,
        args: ['0.5'],
        timeoutMs: 20_000,
        backstopMs: BACKSTOP_MS,
        waitMs: 200,
      }),
    ]);
    expect(results.map((result) => result.code)).toEqual([0, 0]);
  });

  it('reports a skip as a notice, never as a failure', async () => {
    const result = await runGated({
      name: 'tsc',
      binary: slow,
      args: ['0'],
      timeoutMs: 20_000,
      backstopMs: BACKSTOP_MS,
      waitMs: 200,
    });
    expect(result.skipped).toBeUndefined();
    const skipped = { ...result, code: null, skipped: 'another tsc check is running' };
    expect(skippedNotice('tsc -b', skipped)).toBe(true);
    expect(skippedNotice('tsc -b', result)).toBe(false);
  });
});

describe('machine priority', () => {
  it('runs a gated check at the lowest CPU priority so the hub and audio win', async () => {
    const result = await runGated({
      name: 'eslint',
      binary: niceness,
      args: [],
      timeoutMs: 20_000,
      backstopMs: BACKSTOP_MS,
    });
    expect(result.stdout.trim()).toBe('19');
  });
});

describe('process groups', () => {
  it('kills every child of a gated run that exceeds its timeout', async () => {
    const pidFile = join(dir, 'gated.pid');
    const result = await runGated({
      name: 'eslint',
      binary: spawner,
      args: [pidFile],
      timeoutMs: 1000,
      backstopMs: BACKSTOP_MS,
      waitMs: 200,
    });
    const child = await pidFrom(pidFile);
    expect(result.timedOut).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(alive(child)).toBe(false);
  });

  it('kills the whole group when the backstop timer fires', async () => {
    const pidFile = join(dir, 'backstop.pid');
    const result = await run(spawner, [pidFile], 800);
    const child = await pidFrom(pidFile);
    expect(result.timedOut).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(alive(child)).toBe(false);
  });
});
