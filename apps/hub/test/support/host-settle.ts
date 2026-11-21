import { setTimeout as later } from 'node:timers/promises';
import type { SimulatedClock } from '../../src/clock/simulated';
import { OPEN_STORES } from './store';

const QUIET_ROUNDS = 5;

function hostsBusy(): boolean {
  return [...OPEN_STORES].some((store) => store.host.pending > 0);
}

export async function settleWithHost(rounds = 20): Promise<void> {
  for (let round = 0; round < rounds; round += 1) await later(1);
  for (let quiet = 0; quiet < QUIET_ROUNDS;) {
    await later(1);
    quiet = hostsBusy() ? 0 : quiet + 1;
  }
}

export async function advanceSettled(
  clock: SimulatedClock,
  at: string,
  settled: () => Promise<void>,
): Promise<void> {
  const target = Date.parse(at);
  for (;;) {
    clock.advanceTo(at);
    await settled();
    const next = clock.nextDue();
    if (next === undefined || next > target) return;
  }
}
