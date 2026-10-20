import {
  SIGNAL_MATCHER,
  signalMatchesMatcher,
  type DeviceCapability,
  type SignalInput,
  type TriggerNode,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { node, saveAutomation, startRun, trigger } from '../support/automation-fixture';
import { SignalBus } from '../../src/signals/bus';
import { DeviceSignals } from '../../src/signals/sources/device-signals';
import { Inventory } from '../../src/state/inventory';
import { addDevice, addPerson, clockAt } from '../devices/log-fixture';
import { testDatabase, type TestDatabase } from '../support/database';
import { LAMP } from '../support/fake-provider';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = '2026-10-18T10:00:00.000Z';
const clock = clockAt(START);

const BRIGHTNESS: DeviceCapability = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 1, max: 100, step: 1, unit: '%' },
};

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

let opened: TestStore;
let heard: SignalInput[];
let signals: DeviceSignals;

beforeEach(async () => {
  captureLogs();
  clock.set(START);
  opened = await testStore(clock.now);
  heard = [];
  const bus = new SignalBus({ log: testLogger('signals'), now: clock.now });
  bus.subscribe((signal) => {
    heard.push(signal);
  });
  signals = new DeviceSignals({ store: opened.store, signals: bus, now: clock.now });
});

afterEach(async () => {
  await opened.close();
});

function lightIn(roomId: string | null): string {
  return addDevice(opened.store, {
    provider: 'xiaomi',
    externalId: 'lamp-1',
    kind: 'light',
    name: 'Desk lamp',
    model: 'yeelink.light.lamp1',
    roomId,
    capabilities: [POWER, BRIGHTNESS],
  }).id;
}

function matching(match: Record<string, unknown>, signal: SignalInput | undefined): boolean {
  const matcher = SIGNAL_MATCHER.parse({ source: 'device', kind: 'state', match });
  if (signal === undefined) throw new Error('Expected a signal.');
  return signalMatchesMatcher(matcher, signal);
}

describe('device state signals', () => {
  it('carry the facts that let one trigger cover every light, a room, a role or a unit', () => {
    const room = opened.store.rooms.create('Study', 0);
    const lamp = lightIn(room.id);
    signals.moved({ deviceId: lamp, capability: 'brightness', value: 60, previous: 50 });
    expect(heard).toHaveLength(1);
    expect(heard[0]?.data).toStrictEqual({
      family: 'light',
      kind: 'light',
      roomId: room.id,
      provider: 'xiaomi',
      name: 'Desk lamp',
      role: 'brightness',
      unit: '%',
      cause: 'physical',
    });
    expect(matching({ family: 'light' }, heard[0])).toBe(true);
    expect(matching({ family: 'fan' }, heard[0])).toBe(false);
    expect(matching({ roomId: room.id }, heard[0])).toBe(true);
    expect(matching({ roomId: 'another-room' }, heard[0])).toBe(false);
    expect(matching({ role: 'brightness', unit: '%', provider: 'xiaomi' }, heard[0])).toBe(true);
    expect(matching({ name: 'Desk lamp' }, heard[0])).toBe(true);
  });

  it('call a device by the name the home gave it', () => {
    const lamp = lightIn(null);
    opened.store.devices.update(lamp, { display_name: 'Reading light' });
    signals.moved({ deviceId: lamp, capability: 'power', value: true, previous: false });
    expect(matching({ name: 'Reading light' }, heard[0])).toBe(true);
    expect(matching({ name: 'Desk lamp' }, heard[0])).toBe(false);
  });

  it('say a value became unknown instead of staying silent, and carry the value it had', () => {
    const lamp = lightIn(null);
    signals.moved({ deviceId: lamp, capability: 'brightness', value: null, previous: 50 });
    expect(heard.map((signal) => [signal.value, signal.previous])).toStrictEqual([[null, 50]]);
  });

  it('are dropped for a device that no longer exists', () => {
    signals.moved({
      deviceId: '6f3b9d0e-0000-4000-8000-000000000000',
      capability: 'power',
      value: true,
      previous: false,
    });
    expect(heard).toStrictEqual([]);
  });
});

describe('the cause of a device state signal', () => {
  function causeAfter(
    command: { source: 'app' | 'assistant' | 'automation'; requestedBy: string | null } | null,
    automationId: string | null = null,
  ): string | undefined {
    const plug = lightIn(null);
    if (command !== null) {
      const [row] = opened.store.commands.insert([
        { deviceId: plug, capability: 'power', value: true, ...command },
      ]);
      if (row === undefined) throw new Error('No command was stored.');
      if (automationId !== null) {
        const run = startRun(opened.store, automationId);
        opened.store.automationRuns.retainCommands(run.id, [row]);
      }
    }
    clock.set('2026-10-18T10:00:03.000Z');
    signals.moved({ deviceId: plug, capability: 'power', value: true, previous: false });
    const cause = heard.at(-1)?.data['cause'];
    return typeof cause === 'string' ? cause : undefined;
  }

  function automationOn(name: string, triggers: readonly TriggerNode[]): string {
    return saveAutomation(opened.store, {
      name,
      triggers,
      body: [node('flow.wait', { duration: 1000 })],
    }).id;
  }

  it('is physical when nobody sent a command to that value', () => {
    expect(causeAfter(null)).toBe('physical');
  });

  it('is the app when a person sent the command', () => {
    const { client } = addPerson(opened.store, 'Dana');
    expect(causeAfter({ source: 'app', requestedBy: client.id })).toBe('app');
  });

  it('is the assistant when the assistant sent the command', () => {
    expect(causeAfter({ source: 'assistant', requestedBy: null })).toBe('assistant');
  });

  it('is an automation when one that reacts to something ran the command', () => {
    const motion = automationOn('Hallway motion', [
      trigger('trigger.signal', { source: 'event', kind: 'motion' }),
    ]);
    expect(causeAfter({ source: 'automation', requestedBy: null }, motion)).toBe('automation');
  });

  it('is a schedule when an automation that only the clock starts ran the command', () => {
    const nightly = automationOn('Lights out', [trigger('trigger.time', { at: '23:00' })]);
    expect(causeAfter({ source: 'automation', requestedBy: null }, nightly)).toBe('schedule');
  });
});

describe('device online and lifecycle signals', () => {
  let db: TestDatabase;
  let inventory: Inventory;

  beforeEach(async () => {
    db = await testDatabase();
    inventory = new Inventory(db.database, {
      onlineChanged: ({ device, online }): void => {
        signals.online(device, online);
      },
      devicesChanged: (): void => undefined,
      lifecycle: (lifecycle): void => {
        signals.lifecycle(lifecycle);
      },
    });
    signals = new DeviceSignals({
      store: db.store,
      signals: busOf(),
      now: clock.now,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  function busOf(): SignalBus {
    const bus = new SignalBus({ log: testLogger('signals'), now: clock.now });
    bus.subscribe((signal) => {
      heard.push(signal);
    });
    return bus;
  }

  const COMPUTER = {
    ...LAMP,
    provider: 'local' as const,
    externalId: 'computer-1',
    kind: 'computer' as const,
    name: 'Workstation',
    model: 'linux',
    capabilities: [],
  };

  it('tell that a computer went offline, once, with its kind of device', async () => {
    await inventory.apply('local', [COMPUTER]);
    const id = inventory.deviceOf('local', 'computer-1')?.id ?? '';
    heard.length = 0;
    await inventory.setOnlineById(id, false);
    await inventory.setOnlineById(id, false);
    expect(heard.map((signal) => [signal.kind, signal.subject, signal.value])).toStrictEqual([
      ['online', id, false],
    ]);
    expect(heard[0]?.data).toMatchObject({
      family: 'computer',
      kind: 'computer',
      provider: 'local',
    });
    await inventory.setOnlineById(id, true);
    expect(heard.map((signal) => signal.value)).toStrictEqual([false, true]);
  });

  it('tell what happened to a device in the home, from adding it to removing it', async () => {
    await inventory.apply('xiaomi', [LAMP]);
    await inventory.apply('xiaomi', [{ ...LAMP, name: 'Reading lamp' }]);
    await inventory.remove('xiaomi', ['lamp-1']);
    const lifecycle = heard.filter((signal) => signal.kind === 'lifecycle');
    expect(lifecycle.map((signal) => signal.data['change'])).toStrictEqual([
      'added',
      'renamed',
      'removed',
    ]);
    expect(lifecycle[1]?.data).toMatchObject({ from: 'Desk lamp', to: 'Reading lamp' });
    expect(lifecycle[2]?.data).toMatchObject({ family: 'light', name: 'Reading lamp' });
    expect(lifecycle.every((signal) => signal.value === true && signal.field === null)).toBe(true);
  });
});
