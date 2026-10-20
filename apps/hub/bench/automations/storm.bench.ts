import { bench, describe } from 'vitest';
import { z } from 'zod';
import {
  closeSetups,
  lit,
  node,
  program,
  rigV3,
  trigger,
} from '../../test/automations-v3/support/rig-v3';
import { Harness, condition, occurrence } from '../../test/automations-v3/driver/support';
import { record, tick, checked } from './support';

const SIGNALS = 10_000;

const REMOTE = '7e3a1c00-0000-4000-8000-0000000000bb';

const CHANGES_ROW = z.object({ n: z.number() });

function changes(rig: Awaited<ReturnType<typeof rigV3>>): number {
  return CHANGES_ROW.parse(rig.database.prepare('select total_changes() as n').get()).n;
}

async function engineStorm(): Promise<void> {
  const rig = await rigV3();
  const row = rig.add(
    program([node('hold', 'flow.wait', { duration: lit(3_600_000) })], {
      triggers: [trigger('trigger.button', { device: lit(REMOTE), press: lit('single') })],
      policy: { mode: 'single' },
    }),
  );
  rig.engine.sync();
  rig.press(REMOTE, 'single');
  await rig.settle();
  const before = changes(rig);
  const started = performance.now();
  for (let signal = 0; signal < SIGNALS; signal += 1) rig.press(REMOTE, 'single');
  const wallMs = performance.now() - started;
  await tick();
  record('B7', 'time to take 10 000 signals', wallMs, 'ms');
  record('B7', 'run rows for the automation', rig.runs(row.id).length, 'count');
  record('B7', 'sqlite row changes caused by the 10 000 signals', changes(rig) - before, 'count');
  record('B7', 'run records still active', rig.engine.driver.active, 'count');
  await closeSetups();
}

function driverStorm(): void {
  const harness = new Harness();
  const body = condition('hold');
  const automationId = '00000000-0000-4000-8000-00000000f007';
  harness.driver.submit(occurrence({ body, automationId }));
  const base = {
    queued: harness.queued.length,
    started: harness.started.length,
    dropped: harness.dropped.length,
  };
  const started = performance.now();
  for (let signal = 0; signal < SIGNALS; signal += 1) {
    harness.driver.submit(occurrence({ body, automationId }));
  }
  const wallMs = performance.now() - started;
  harness.driver.shutdown();
  record('B7', 'driver time for 10 000 submissions', wallMs, 'ms');
  record(
    'B7',
    'driver: runs started by the signals',
    harness.started.length - base.started,
    'count',
  );
  record('B7', 'driver: runs queued by the signals', harness.queued.length - base.queued, 'count');
  record('B7', 'driver: live drop events', harness.dropped.length - base.dropped, 'count');
  record('B7', 'driver: decision rows written', harness.decisions.length, 'count');
  record(
    'B7',
    'driver: occurrences summed in the decision rows',
    harness.decisions.reduce((total, row) => total + (row.times ?? 1), 0),
    'count',
  );
}

describe('B7 ten thousand signals in one second into a single automation', () => {
  bench(
    'B7 storm through the engine and through the driver',
    () =>
      checked(async () => {
        await engineStorm();
        driverStorm();
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
});
