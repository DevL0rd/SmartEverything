import { StepReads, type ReadFetch } from '../../src/automations/world-v3/step-reads';
import { READ_UNITS, type ReadUnits } from '../../src/store/host/registry';
import type { UnitInput, UnitOutput } from '../../src/store/host/unit';
import type { SeededStore } from './store';

function ranRead<N extends keyof ReadUnits>(
  store: SeededStore,
  name: N,
  input: UnitInput<ReadUnits[N]>,
): UnitOutput<ReadUnits[N]>;
function ranRead<N extends keyof ReadUnits>(
  store: SeededStore,
  name: N,
  input: UnitInput<ReadUnits[N]>,
): unknown {
  const unit: { readonly run: unknown } = READ_UNITS[name];
  if (typeof unit.run !== 'function') throw new TypeError(`${name} is not a read unit`);
  const value: unknown = Reflect.apply(unit.run, unit, [store, structuredClone(input)]);
  return value;
}

export function directFetch(store: SeededStore): ReadFetch {
  return (name, input) => ranRead(store, name, input);
}

export class NoReadsError extends Error {
  override readonly name = 'NoReadsError';

  constructor() {
    super('This test run fetches no reads.');
  }
}

export function noReads(): StepReads {
  return new StepReads(
    { read: () => Promise.reject(new NoReadsError()) },
    { now: () => new Date() },
  );
}
