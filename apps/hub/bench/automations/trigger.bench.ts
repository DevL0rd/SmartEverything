import { DatabaseSync, StatementSync } from 'node:sqlite';
import { bench, describe, vi } from 'vitest';
import { z } from 'zod';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
} from '../../test/automations-v3/support/rig-v3';
import type { RigV3 } from '../../test/automations-v3/support/rig-v3';
import { percentile, record, tick, checked } from './support';

const REMOTE = '7e3a1c00-0000-4000-8000-0000000000aa';

const WRITE = /^\s*(insert|update|delete|replace)/i;

const TABLE = /^\s*(?:insert\s+(?:or\s+\w+\s+)?into|update|delete\s+from|replace\s+into)\s+(\w+)/i;

const STATEMENT = z.object({ sourceSQL: z.string() });

interface Event {
  readonly order: number;
  readonly text: string;
  readonly statement: boolean;
}

interface Counts {
  begins: number;
  autocommit: number;
  writes: number;
  readonly tables: Map<string, number>;
}

function countsOf(events: readonly Event[]): Counts {
  const counts: Counts = { begins: 0, autocommit: 0, writes: 0, tables: new Map() };
  let depth = 0;
  for (const event of [...events].sort((left, right) => left.order - right.order)) {
    if (!event.statement) {
      if (/^\s*begin/i.test(event.text)) {
        counts.begins += 1;
        depth += 1;
      } else if (/^\s*(commit|rollback)/i.test(event.text)) {
        depth = Math.max(0, depth - 1);
      }
    } else if (WRITE.test(event.text)) {
      counts.writes += 1;
      const table = TABLE.exec(event.text)?.[1] ?? 'other';
      counts.tables.set(table, (counts.tables.get(table) ?? 0) + 1);
      if (depth === 0) counts.autocommit += 1;
    }
  }
  return counts;
}

function pressProgram(lamp: string, devices: number): ReturnType<typeof program> {
  const sets = Array.from({ length: devices }, (_, index) =>
    node(`set${String(index)}`, 'device.set', {
      target: lit({ device: lamp }),
      control: lit('brightness'),
      to: lit(10 + index),
    }),
  );
  return program(sets, {
    triggers: [trigger('trigger.button', { device: lit(REMOTE), press: lit('single') })],
    policy: { mode: 'queue', max: 10 },
  });
}

async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 2000 && !done(); turn += 1) await tick();
}

async function firstCommandLatencies(rig: RigV3, presses: number): Promise<number[]> {
  const latencies: number[] = [];
  for (let press = 0; press < presses; press += 1) {
    const before = rig.home.adapter.executed.length;
    const finishedBefore = rig.finished.length;
    const started = performance.now();
    rig.press(REMOTE, 'single');
    await until(() => rig.home.adapter.executed.length > before);
    if (rig.home.adapter.executed.length === before)
      throw new Error('no command reached the adapter');
    latencies.push((performance.now() - started) * 1000);
    await until(() => rig.finished.length > finishedBefore);
    if (rig.finished.length === finishedBefore) throw new Error('the run did not finish');
    await rig.advance(60_000);
  }
  return latencies;
}

describe('B2 and B4 trigger to first command and writes per run', () => {
  bench(
    'B2 hub overhead to the first command, B4 transactions per run',
    () =>
      checked(async () => {
        const rig = await rigV3();
        rig.add(pressProgram(rig.home.lampId, 4));
        rig.engine.sync();
        await firstCommandLatencies(rig, 20);
        const latencies = await firstCommandLatencies(rig, 200);
        record('B2', 'press to first command median', percentile(latencies, 0.5), 'us');
        record('B2', 'press to first command p95', percentile(latencies, 0.95), 'us');
        record('B2', 'press to first command max', Math.max(...latencies), 'us');
        const exec = vi.spyOn(DatabaseSync.prototype, 'exec');
        const run = vi.spyOn(StatementSync.prototype, 'run');
        const finishedBefore = rig.finished.length;
        rig.press(REMOTE, 'single');
        await until(() => rig.finished.length > finishedBefore);
        await tick();
        const counts = countsOf([
          ...exec.mock.calls.map((call, index) => ({
            order: exec.mock.invocationCallOrder[index] ?? 0,
            text: call[0],
            statement: false,
          })),
          ...run.mock.contexts.map((context, index) => ({
            order: run.mock.invocationCallOrder[index] ?? 0,
            text: STATEMENT.parse(context).sourceSQL,
            statement: true,
          })),
        ]);
        exec.mockRestore();
        run.mockRestore();
        for (const [table, count] of counts.tables)
          record('B4', `write statements on ${table}`, count, 'count');
        if (rig.finished.length === finishedBefore) throw new Error('the run did not finish');
        record('B4', 'write statements for one 4 command run', counts.writes, 'count');
        record('B4', 'explicit transactions for one run', counts.begins, 'count');
        record('B4', 'autocommit writes for one run', counts.autocommit, 'count');
        record('B4', 'transactions for one run', counts.begins + counts.autocommit, 'count');
        await closeSetups();
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
});
