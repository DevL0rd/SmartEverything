import {
  JSON_VALUE,
  MICROWAVE_KEYS,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceRow,
  type EventRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cyclesOf } from '../../src/devices/device-log/microwave-cycles';
import { readDeviceLog } from '../../src/devices/device-log/read';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { addDevice, addPerson, clockAt } from './log-fixture';

let opened: TestStore;
const clock = clockAt('2026-10-17T07:00:00.000Z');

beforeEach(async () => {
  captureLogs();
  clock.set('2026-10-17T07:00:00.000Z');
  opened = await testStore(clock.now);
});

afterEach(async () => {
  await opened.close();
});

function enumCapability(key: CapabilityKey, label: string, options: string[]): DeviceCapability {
  return { key, label, access: 'read_write', value: { kind: 'enum', options } };
}

function microwave(): DeviceRow {
  return addDevice(opened.store, {
    externalId: 'microwave-1',
    kind: 'appliance',
    name: 'Microwave',
    model: 'TP1X_DA-KS-MICROWAVE-01041',
    capabilities: [
      enumCapability(MICROWAVE_KEYS.mode, 'Mode', ['Convection', 'MicroWave']),
      enumCapability(MICROWAVE_KEYS.power, 'Power', ['100%', '50%']),
      enumCapability(MICROWAVE_KEYS.state, 'State', ['ready', 'running', 'paused']),
    ],
  });
}

interface Reading {
  readonly capability: string;
  readonly value: string;
  readonly summary: string;
}

function activity(device: DeviceRow, at: string, reading: Reading): void {
  opened.store.events.insert([
    {
      deviceId: device.id,
      kind: 'activity',
      occurredAt: at,
      details: { component: 'main', topic: 'Cooking', ...reading },
    },
  ]);
}

const STATE = MICROWAVE_KEYS.state;
const JOB = MICROWAVE_KEYS.job;

function recordedSequence(device: DeviceRow): void {
  activity(device, '2026-10-17T07:20:11.000Z', {
    capability: STATE,
    value: 'running',
    summary: 'Cooking started',
  });
  activity(device, '2026-10-17T07:23:12.000Z', {
    capability: JOB,
    value: 'finished',
    summary: 'Cooking finished',
  });
  activity(device, '2026-10-17T07:23:12.000Z', {
    capability: STATE,
    value: 'ready',
    summary: 'Microwave ready',
  });
  activity(device, '2026-10-17T15:44:32.000Z', {
    capability: STATE,
    value: 'running',
    summary: 'Cooking started',
  });
  activity(device, '2026-10-17T15:47:05.000Z', {
    capability: STATE,
    value: 'paused',
    summary: 'Cooking paused',
  });
  activity(device, '2026-10-17T15:47:14.000Z', {
    capability: STATE,
    value: 'ready',
    summary: 'Microwave ready',
  });
}

describe('cooking cycles from the recorded event sequence', () => {
  it('finds a finished cycle and one that was stopped before it finished', () => {
    const device = microwave();
    recordedSequence(device);
    const events: EventRow[] = opened.store.events.list({ deviceIds: [device.id], limit: 100 });
    expect(cyclesOf(events)).toEqual([
      {
        startedAt: '2026-10-17T07:20:11.000Z',
        endedAt: '2026-10-17T07:23:12.000Z',
        finished: true,
      },
      {
        startedAt: '2026-10-17T15:44:32.000Z',
        endedAt: '2026-10-17T15:47:14.000Z',
        finished: false,
      },
    ]);
  });

  it('does not report a cycle that is still running or whose start is not in view', () => {
    const device = microwave();
    activity(device, '2026-10-17T08:00:00.000Z', {
      capability: STATE,
      value: 'ready',
      summary: 'Microwave ready',
    });
    activity(device, '2026-10-17T09:00:00.000Z', {
      capability: STATE,
      value: 'running',
      summary: 'Cooking started',
    });
    const events = opened.store.events.list({ deviceIds: [device.id], limit: 100 });
    expect(cyclesOf(events)).toEqual([]);
  });

  it('counts a finish recorded in the same second after the ready as part of the cycle', () => {
    const device = microwave();
    activity(device, '2026-10-17T07:20:11.000Z', {
      capability: STATE,
      value: 'running',
      summary: 'Cooking started',
    });
    activity(device, '2026-10-17T07:23:12.000Z', {
      capability: STATE,
      value: 'ready',
      summary: 'Microwave ready',
    });
    activity(device, '2026-10-17T07:23:12.000Z', {
      capability: JOB,
      value: 'finished',
      summary: 'Cooking finished',
    });
    expect(
      cyclesOf(opened.store.events.list({ deviceIds: [device.id], limit: 100 }))[0]?.finished,
    ).toBe(true);
  });
});

const SPECIFICATION = {
  single: [
    {
      mode: 'Convection',
      supportedOperations: ['start', 'set'],
      supportedOptions: {
        temperature: { C: { min: 40, max: 200, default: 180, resolution: 5 } },
        operationTime: {
          min: '00:00:10',
          max: '01:00:00',
          default: '00:10:00',
          resolution: '00:00:10',
        },
      },
    },
    {
      mode: 'MicroWave',
      supportedOperations: ['set'],
      supportedOptions: {
        operationTime: {
          min: '00:00:10',
          max: '01:30:00',
          default: '00:01:00',
          resolution: '00:00:10',
        },
        powerLevel: { default: '100W', supportedValues: ['100W', '300W', '900W'] },
      },
    },
  ],
};

function program(
  device: DeviceRow,
  values: readonly (readonly [string, string | number | object])[],
): void {
  for (const [capability, value] of values) {
    opened.store.state.write([
      {
        deviceId: device.id,
        capability,
        value: JSON_VALUE.parse(value),
        observedAt: '2026-10-17T07:00:00.000Z',
      },
    ]);
  }
}

describe('the microwave log', () => {
  it('shows each cycle with its settings and who started it, and leaves the raw cooking events out', () => {
    const { store } = opened;
    const { client } = addPerson(store, 'Dana');
    const device = microwave();
    program(device, [
      [MICROWAVE_KEYS.specification, SPECIFICATION],
      [MICROWAVE_KEYS.mode, 'Convection'],
      [MICROWAVE_KEYS.temperature, 180],
      [MICROWAVE_KEYS.power, '300W'],
      [MICROWAVE_KEYS.duration, '00:03:00'],
    ]);
    clock.set('2026-10-17T07:20:09.000Z');
    store.commands.insert([
      {
        deviceId: device.id,
        capability: MICROWAVE_KEYS.start,
        value: null,
        source: 'app',
        requestedBy: client.id,
      },
    ]);
    recordedSequence(device);
    activity(device, '2026-10-17T07:19:58.000Z', {
      capability: 'raw:samsungce.door_state.door_state',
      value: 'open',
      summary: 'Door opened',
    });
    const entries = readDeviceLog(store, { device, to: undefined, limit: 20, tier: null });
    expect(entries.map((entry) => [entry.kind, entry.title])).toEqual([
      ['cycle', 'Stopped early'],
      ['cycle', 'Cooking finished'],
      ['event', 'Door opened'],
    ]);
    expect(entries[1]).toMatchObject({
      at: '2026-10-17T07:23:12.000Z',
      started_at: '2026-10-17T07:20:11.000Z',
      value: 'Convection · 180 °C · 3 min',
      settings: { mode: 'Convection', temperature: 180, seconds: 180 },
      cause: { kind: 'app', name: 'Dana' },
    });
    expect(entries[0]?.cause).toEqual({ kind: 'device' });
  });

  it('keeps the power of a microwave program and drops a temperature the mode does not take', () => {
    const device = microwave();
    program(device, [
      [MICROWAVE_KEYS.specification, SPECIFICATION],
      [MICROWAVE_KEYS.mode, 'MicroWave'],
      [MICROWAVE_KEYS.temperature, 180],
      [MICROWAVE_KEYS.power, '300W'],
      [MICROWAVE_KEYS.duration, '00:01:30'],
    ]);
    activity(device, '2026-10-17T07:20:11.000Z', {
      capability: STATE,
      value: 'running',
      summary: 'Cooking started',
    });
    activity(device, '2026-10-17T07:21:41.000Z', {
      capability: JOB,
      value: 'finished',
      summary: 'Cooking finished',
    });
    activity(device, '2026-10-17T07:21:41.000Z', {
      capability: STATE,
      value: 'ready',
      summary: 'Microwave ready',
    });
    const [entry] = readDeviceLog(opened.store, { device, to: undefined, limit: 5, tier: null });
    expect(entry).toMatchObject({
      value: 'Microwave · 300W · 1 min 30 s',
      settings: { mode: 'MicroWave', power: '300W', seconds: 90 },
    });
    expect(entry?.settings).not.toHaveProperty('temperature');
  });
});
