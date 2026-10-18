import { describe, expect, it } from 'vitest';
import { comfortSelector, sameReadings } from '../../climate';
import type { StoreState } from '../../../store/state';
import {
  changedSlices,
  SubscriptionManager,
  trackReads,
  type Slice,
} from '../../../store/subscriptions';
import { consumersOf, sameConsumers } from './consumers';
import { deviceFixture, stateFixture, valuesFixture } from '../../../store/device-fixture';
import { powerOf, samePower } from './power';
import { roomSummaries, sameRooms } from './rooms';
import { sameSecurity, securityLines } from './security';

const DEVICES = 300;
const NOTICES = 1000;

interface Probe {
  readonly name: string;
  readonly select: (state: StoreState) => unknown;
  readonly equal: (left: never, right: never) => boolean;
}

const PROBES: readonly Probe[] = [
  { name: 'power', select: powerOf, equal: samePower },
  { name: 'security', select: securityLines, equal: sameSecurity },
  { name: 'consumers', select: consumersOf, equal: sameConsumers },
  { name: 'rooms', select: roomSummaries, equal: sameRooms },
  {
    name: 'comfort',
    select: comfortSelector(['temperature', 'humidity'], null),
    equal: sameReadings,
  },
];

function initial(): StoreState {
  const devices = Array.from({ length: DEVICES }, (_, index) => deviceFixture(index));
  return stateFixture(
    devices,
    Object.fromEntries(devices.map((device, index) => [device.id, valuesFixture(index, 0)])),
  );
}

function next(state: StoreState, notice: number): StoreState {
  const index = (notice * 37) % DEVICES;
  const id = `dev-${String(index)}`;
  return {
    ...state,
    deviceValues: state.deviceValues.set(id, valuesFixture(index, notice + 1)),
  };
}

interface Tally {
  evaluations: number;
  renders: number;
  micros: number;
}

function same(probe: Probe, left: unknown, right: unknown): boolean {
  return Object.is(left, right) || Reflect.apply(probe.equal, undefined, [left, right]) === true;
}

function run(probe: Probe): Tally {
  const tally: Tally = { evaluations: 0, renders: 0, micros: 0 };
  const manager = new SubscriptionManager();
  let state = initial();
  let shown: { value: unknown; reads: ReadonlySet<Slice> } = trackReads(state, probe.select);
  manager.add({
    get reads() {
      return shown.reads;
    },
    wake: () => {
      tally.evaluations += 1;
      const fresh = trackReads(state, probe.select);
      const unchanged = same(probe, shown.value, fresh.value);
      if (!unchanged) tally.renders += 1;
      shown = { value: unchanged ? shown.value : fresh.value, reads: fresh.reads };
    },
  });
  for (let notice = 0; notice < NOTICES; notice += 1) {
    const before = state;
    state = next(state, notice);
    manager.mark(changedSlices(before, state));
    const started = performance.now();
    manager.flush();
    tally.micros += (performance.now() - started) * 1000;
  }
  return tally;
}

describe('home aggregates with 300 devices and 1000 value notices', () => {
  it('reports the cost per notice', () => {
    const lines: string[] = [];
    for (const probe of PROBES) {
      run(probe);
      const tally = run(probe);
      lines.push(
        `${probe.name}: ${(tally.micros / NOTICES).toFixed(1)} us/notice, ` +
          `${String(tally.evaluations)} evaluations, ${String(tally.renders)} renders`,
      );
      expect(tally.micros / NOTICES).toBeLessThan(2000);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  });
});
