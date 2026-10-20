import type { CommandRow, DeviceCapability, SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commandMetadata } from '../../src/automations/effects/command-metadata';
import { SignalBus } from '../../src/signals/bus';
import { DeviceSignals } from '../../src/signals/sources/device-signals';
import { addDevice, clockAt } from '../devices/log-fixture';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const clock = clockAt('2026-10-18T10:00:00.000Z');

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
  clock.set('2026-10-18T10:00:00.000Z');
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

function lamp(): string {
  return addDevice(opened.store, {
    provider: 'xiaomi',
    externalId: 'lamp-1',
    kind: 'light',
    name: 'Desk lamp',
    model: 'yeelink.light.lamp1',
    roomId: null,
    capabilities: [POWER],
  }).id;
}

function commandOnLamp(source: 'app' | 'automation'): { deviceId: string; row: CommandRow } {
  const deviceId = lamp();
  const [row] = opened.store.commands.insert([
    { deviceId, capability: 'power', value: true, source, requestedBy: null },
  ]);
  if (row === undefined) throw new Error('No command was stored.');
  return { deviceId, row };
}

function moveAfter(deviceId: string): SignalInput {
  clock.set('2026-10-18T10:00:03.000Z');
  signals.moved({ deviceId, capability: 'power', value: true, previous: false });
  const signal = heard.at(-1);
  if (signal === undefined) throw new Error('No signal was emitted.');
  return signal;
}

describe('the run behind a device state signal', () => {
  it('carries the run, the automation and the depth stamped on the command that caused it', () => {
    const { deviceId, row } = commandOnLamp('automation');
    commandMetadata(opened.store).stamp(
      [row],
      {
        nodePath: null,
        iteration: 0,
        attempt: 1,
        runId: 'run-a',
        idempotencyKey: 'k',
        causeRunId: 'run-a',
        causeAutomationId: 'automation-a',
        causeDepth: 2,
      },
      clock.now().getTime(),
    );
    const { data } = moveAfter(deviceId);
    expect(data['cause']).toBe('automation');
    expect(data['causeRunId']).toBe('run-a');
    expect(data['causeAutomationId']).toBe('automation-a');
    expect(data['causeDepth']).toBe(2);
  });

  it('adds nothing when the command carries no stamp', () => {
    const { deviceId } = commandOnLamp('app');
    const { data } = moveAfter(deviceId);
    expect(data['cause']).toBe('app');
    expect(Object.keys(data)).not.toContain('causeRunId');
  });

  it('adds nothing for a physical change', () => {
    const { data } = moveAfter(lamp());
    expect(data['cause']).toBe('physical');
    expect(Object.keys(data)).not.toContain('causeAutomationId');
  });
});
