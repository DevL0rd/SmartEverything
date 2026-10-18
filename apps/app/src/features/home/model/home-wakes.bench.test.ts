import { describe, expect, it } from 'vitest';
import { deviceFixture, stateFixture, valuesFixture } from '../../../store/device-fixture';
import { deviceOf, makeTable, rowsOf, type StoreState } from '../../../store/state';
import { shallowEqual } from '../../../store/store-context';
import { changedSlices, SubscriptionManager, trackReads } from '../../../store/subscriptions';
import { hasScale } from '../../profiles';
import { favouritesOf, sameFavourites } from './favourites';

const DEVICES = 300;
const NOTICES = 200;

interface Probe {
  readonly name: string;
  readonly select: (state: StoreState) => unknown;
  readonly equal: (left: never, right: never) => boolean;
}

type Notice = (state: StoreState, index: number) => StoreState;

const SCALE_BEFORE: Probe = {
  name: 'scale presence (before: device list)',
  select: (state) => rowsOf(state.tables.devices),
  equal: shallowEqual,
};

const SCALE_AFTER: Probe = {
  name: 'scale presence (after: boolean)',
  select: hasScale,
  equal: Object.is,
};

const FAVOURITES: Probe = {
  name: 'favourites chosen',
  select: favouritesOf,
  equal: sameFavourites,
};

const PROBES: readonly Probe[] = [SCALE_BEFORE, SCALE_AFTER, FAVOURITES];

function initial(): StoreState {
  const devices = Array.from({ length: DEVICES }, (_, index) =>
    deviceFixture(index, { favourite: index < 6 }),
  );
  return stateFixture(
    devices,
    Object.fromEntries(devices.map((device, index) => [device.id, valuesFixture(index, 0)])),
  );
}

const valueNotice: Notice = (state, index) => {
  const at = (index * 37) % DEVICES;
  const id = `dev-${String(at)}`;
  return {
    ...state,
    deviceValues: state.deviceValues.set(id, valuesFixture(at, index + 1)),
  };
};

const rowNotice: Notice = (state, index) => {
  const at = (index * 37) % DEVICES;
  const id = `dev-${String(at)}`;
  const row = state.tables.devices.byId[id];
  if (row === undefined) return state;
  const byId = {
    ...state.tables.devices.byId,
    [id]: deviceOf({
      ...row,
      updated_at: `2026-10-16T09:00:${String(index % 60).padStart(2, '0')}Z`,
    }),
  };
  return {
    ...state,
    tables: {
      ...state.tables,
      devices: makeTable(byId, state.tables.devices.ids, state.tables.devices.version + 1),
    },
  };
};

const commandNotice: Notice = (state) => ({
  ...state,
  tables: {
    ...state.tables,
    commands: makeTable({}, [], state.tables.commands.version + 1),
  },
});

const NOTICE_KINDS: readonly (readonly [string, Notice])[] = [
  ['device value', valueNotice],
  ['device row', rowNotice],
  ['command', commandNotice],
];

function same(probe: Probe, left: unknown, right: unknown): boolean {
  return Object.is(left, right) || Reflect.apply(probe.equal, undefined, [left, right]) === true;
}

function run(probe: Probe, notice: Notice): { evaluations: number; renders: number } {
  const tally = { evaluations: 0, renders: 0 };
  const manager = new SubscriptionManager();
  let state = initial();
  let shown = trackReads(state, probe.select);
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
  for (let index = 0; index < NOTICES; index += 1) {
    const before = state;
    state = notice(state, index);
    manager.mark(changedSlices(before, state));
    manager.flush();
  }
  return tally;
}

describe('home wake counts per notice (one subscriber, 300 devices, 200 notices)', () => {
  it('prints evaluations and renders, and a value notice renders nothing', () => {
    const lines: string[] = [];
    for (const probe of PROBES) {
      for (const [kind, notice] of NOTICE_KINDS) {
        const tally = run(probe, notice);
        lines.push(
          `${probe.name} / ${kind}: ${String(tally.evaluations)} evaluations, ${String(tally.renders)} renders`,
        );
      }
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    expect(run(SCALE_AFTER, rowNotice).renders).toBe(0);
    expect(run(FAVOURITES, commandNotice).evaluations).toBe(0);
    expect(run(FAVOURITES, valueNotice).renders).toBe(0);
  });
});
