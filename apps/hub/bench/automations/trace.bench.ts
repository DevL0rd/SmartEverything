import { bench, describe } from 'vitest';
import { effectOp, loopOf, realDriver, record, checked } from './support';

describe('B8 and B9 what the driver hands to a live trace today', () => {
  bench(
    'B8 and B9 step records per slice of a tight loop',
    () =>
      checked(async () => {
        const real = realDriver(true);
        real.begin(loopOf(5000, effectOp('turn')));
        const { state } = await real.finished;
        const { count, records, bytes } = real.slices;
        record('B8', 'live trace consumers in the hub', 0, 'count');
        record('B9', 'steps in the loop run', state.budgets.steps, 'count');
        record('B9', 'slices the driver ran', count, 'count');
        record('B9', 'step records handed to the sink', records, 'count');
        record('B9', 'step records per slice', records / Math.max(1, count), 'count');
        record('B9', 'json bytes per slice', bytes / Math.max(1, count), 'bytes');
        record('B9', 'json bytes per step', bytes / Math.max(1, state.budgets.steps), 'bytes');
      }),
    { iterations: 1, warmupIterations: 0, time: 0 },
  );
});
