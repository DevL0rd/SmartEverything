import { bench, describe, vi } from 'vitest';
import { SignalWatch } from '../../src/signals/signal-watch';
import {
  closeSetups,
  lit,
  program,
  rigV3,
  trigger,
} from '../../test/automations-v3/support/rig-v3';
import { record, checked } from './support';

const AUTOMATIONS = 100;

function deviceId(index: number): string {
  return `7e3a1c00-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

describe('B10 saving one automation among 100', () => {
  bench(
    'B10 reload of one automation',
    () =>
      checked(async () => {
        const rig = await rigV3();
        const rows = Array.from({ length: AUTOMATIONS }, (_, index) =>
          rig.add(
            program([], {
              triggers: [
                trigger('trigger.button', { device: lit(deviceId(index)), press: lit('single') }),
              ],
            }),
            `Bench ${String(index)}`,
          ),
        );
        const syncStarted = performance.now();
        rig.engine.sync();
        record('B10', 'sync of 100 automations', performance.now() - syncStarted, 'ms');
        for (let index = 0; index < AUTOMATIONS; index += 1) rig.press(deviceId(index), 'single');
        const stops = vi.spyOn(SignalWatch.prototype, 'stop');
        const first = rows[0];
        if (first === undefined) throw new Error('no automation');
        rig.database
          .prepare('update automations set revision = revision + 1 where id = ?')
          .run(first.id);
        const started = performance.now();
        rig.engine.reload(first.id);
        record('B10', 'reload of one automation', performance.now() - started, 'ms');
        const stopped = stops.mock.calls.length;
        stops.mockRestore();
        record('B10', 'live signal watches of other automations dropped', stopped, 'count');
        record('B10', 'live signal watches before the reload', AUTOMATIONS, 'count');
        await closeSetups();
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
});
