import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { DEFAULT_HISTORY_POLICY, type NodeSampleFrame } from '@smarteverything/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workerMetrics } from '../../../src/node/metrics/worker-metrics';
import type { NodeMetrics } from '../../../src/node/metrics/node-metrics';
import { captureLogs, testLogger } from '../../support/logs';

let folder: string;
let script: string;

beforeAll(async () => {
  folder = await mkdtemp(join(fileURLToPath(new URL('../../../', import.meta.url)), '.metrics-'));
  script = join(folder, 'computer-metrics.mjs');
  await build({
    entryPoints: [
      fileURLToPath(new URL('../../../src/node/metrics/metrics-worker.ts', import.meta.url)),
    ],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
}, 60_000);

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

function started(frames: NodeSampleFrame[], arrived: () => void): NodeMetrics {
  return workerMetrics({ script, machineId: 'a'.repeat(32) })({
    processes: {
      read: () => {
        throw new Error('the worker reads its own processes');
      },
      watch: () => {
        throw new Error('the worker watches its own processes');
      },
    },
    policy: DEFAULT_HISTORY_POLICY,
    emit: (frame) => {
      frames.push(frame);
      arrived();
    },
    now: Date.now,
    log: testLogger('node'),
  });
}

describe.runIf(process.platform === 'linux')('the computer metrics in their own thread', () => {
  it('greets, samples the summary and answers history from the worker', async () => {
    const logs = captureLogs();
    const frames: NodeSampleFrame[] = [];
    let arrived = (): void => undefined;
    const sampled = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const metrics = started(frames, () => {
      arrived();
    });
    const hello = await metrics.hello(new Date());
    expect(hello.features.length).toBeGreaterThan(0);
    metrics.track(DEFAULT_HISTORY_POLICY);
    metrics.start();
    metrics.demand('test', { summary: 1000 });
    await sampled;
    expect(frames[0]).toMatchObject({ type: 'sample', parts: { summary: {} } });
    const columns = await metrics.backfill({ topics: ['summary'], maxPoints: 10, sinceMs: 0 });
    expect(columns.intervalMs).toBe(DEFAULT_HISTORY_POLICY.interval_ms);
    metrics.close();
    await expect(metrics.hello(new Date())).rejects.toThrow('stopped');
    expect(logs.events()).toContain('node.sampler_started');
  }, 30_000);
});
