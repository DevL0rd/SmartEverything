import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PLAN } from '../../src/compile/plan';
import { cases } from '../arbitraries/program-arb';
import { begin, drive, reload, runToEnd } from '../arbitraries/rig';
import type { Rig } from '../arbitraries/rig';
import { LONG, RUNS } from './support';

function rebuilt(rig: Rig): Rig {
  return {
    main: PLAN.parse(JSON.parse(JSON.stringify(rig.main))),
    callee: PLAN.parse(JSON.parse(JSON.stringify(rig.callee))),
  };
}

describe('the same plan, trigger, captures and seed', () => {
  it(
    'give the same path and the same effects every time',
    () => {
      fc.assert(
        fc.property(cases, ({ rig, seed }) => {
          expect(runToEnd(rig, seed)).toEqual(runToEnd(rig, seed));
          expect(runToEnd(rebuilt(rig), seed)).toEqual(runToEnd(rig, seed));
        }),
        { numRuns: RUNS },
      );
    },
    LONG,
  );

  it(
    'follow the seed: another seed may take another path but still ends',
    () => {
      fc.assert(
        fc.property(cases, fc.integer({ min: 0, max: 1000 }), ({ rig }, other) => {
          expect(runToEnd(rig, other).ending.kind).toMatch(/done|failed|parked/);
        }),
        { numRuns: RUNS },
      );
    },
    LONG,
  );
});

describe('a run saved at a durable park', () => {
  it(
    'resumes to the same ending as the run that was never interrupted',
    () => {
      let resumed = 0;
      fc.assert(
        fc.property(cases, fc.nat(50), ({ rig, seed }, pick) => {
          const whole = runToEnd(rig, seed);
          const durable = whole.journal.parks.filter((wait) => wait.durable).length;
          if (durable === 0) return;
          const paused = drive(rig, begin(seed), { pauseAtDurablePark: pick % durable });
          if (paused.kind !== 'paused')
            throw new Error('the run ended before the park it was asked to stop at');
          const next = drive(rebuilt(rig), reload(paused.cursor));
          if (next.kind !== 'finished') throw new Error('the resumed run paused again');
          expect(next.finished).toEqual(whole);
          resumed += 1;
        }),
        { numRuns: RUNS },
      );
      expect(resumed).toBeGreaterThan(0);
    },
    LONG,
  );
});
