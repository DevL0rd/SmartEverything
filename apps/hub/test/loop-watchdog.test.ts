import { fork } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const LINE = z.object({ event: z.string(), payload: z.record(z.string(), z.unknown()) });

interface Finished {
  readonly code: number | null;
  readonly signal: string | null;
  readonly lines: readonly z.output<typeof LINE>[];
}

let folder: string;
let subject: string;
let worker: string;

async function bundle(entry: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
}

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'loop-watchdog-'));
  subject = join(folder, 'subject.mjs');
  worker = join(folder, 'loop-watchdog.mjs');
  await bundle('./support/loop-watchdog-subject.ts', subject);
  await bundle('../src/service/loop-watchdog/worker.ts', worker);
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function run(mode: string): Promise<Finished> {
  const log = join(folder, `${mode}.log`);
  const child = fork(subject, [mode, worker, log], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const outcome = await new Promise<Pick<Finished, 'code' | 'signal'>>((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
  const text = await readFile(log, 'utf8');
  const lines = text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => LINE.parse(JSON.parse(line)));
  return { ...outcome, lines };
}

const events = (finished: Finished): string[] => finished.lines.map((line) => line.event);

function payloadOf(finished: Finished, event: string): Record<string, unknown> {
  const line = finished.lines.find((one) => one.event === event);
  if (line === undefined) {
    throw new Error(`The watchdog subject did not log ${event}`);
  }
  return line.payload;
}

describe('loop watchdog', () => {
  it('leaves a process alone whose loop keeps turning', async () => {
    const finished = await run('idle');
    expect(finished.code).toBe(0);
    expect(events(finished)).toEqual(['loop.watchdog_started']);
  }, 30_000);

  it('kills a process whose loop never turns again and logs what it was running', async () => {
    const finished = await run('spin');
    expect(finished.signal).toBe('SIGKILL');
    expect(events(finished)).toEqual(
      expect.arrayContaining(['loop.watchdog_started', 'loop.stalled', 'loop.starved']),
    );
    const frames = payloadOf(finished, 'loop.stalled')['frames'];
    expect(JSON.stringify(frames)).toContain('blockForever');
    expect(payloadOf(finished, 'loop.starved')['stalledMs']).toBeGreaterThanOrEqual(3000);
  }, 30_000);

  it('logs a stall that ends by itself with the code it stood in, and keeps the process', async () => {
    const finished = await run('pause');
    expect(finished.code).toBe(0);
    expect(events(finished)).not.toContain('loop.starved');
    expect(events(finished)).toEqual(expect.arrayContaining(['loop.stalled', 'loop.lagged']));
    expect(JSON.stringify(payloadOf(finished, 'loop.stalled')['frames'])).toContain('blockBriefly');
    expect(payloadOf(finished, 'loop.lagged')['lateMs']).toBeGreaterThanOrEqual(1000);
  }, 30_000);
});
