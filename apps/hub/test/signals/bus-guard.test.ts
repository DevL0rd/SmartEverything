import {
  DEFAULT_TRIGGER_SETTINGS,
  type SignalInput,
  type SignalKindSpec,
  type SignalSourceSpec,
  type TriggerSettings,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { SignalBus } from '../../src/signals/bus';
import { STORM_ANNOUNCE_INTERVAL_MS } from '../../src/signals/rate-guard';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const START = Date.parse('2026-10-18T10:00:00.000Z');
const LAMP = '11111111-1111-4111-8111-111111111111';

const PRIVATE_KIND: SignalKindSpec = {
  kind: 'private',
  label: 'Private thing',
  subject: 'none',
  fields: [],
  match: [],
  pulse: true,
  optIn: true,
};

const PRIVATE_SOURCE: SignalSourceSpec = {
  source: 'plugin_secret',
  label: 'Secret',
  kinds: [PRIVATE_KIND],
};

let logs: CapturedLogs;
let now: number;
let triggers: TriggerSettings;
let bus: SignalBus;
let heard: SignalInput[];

beforeEach(() => {
  logs = captureLogs();
  now = START;
  triggers = DEFAULT_TRIGGER_SETTINGS;
  bus = new SignalBus({
    log: testLogger('signals'),
    now: (): Date => new Date(now),
    triggers: (): TriggerSettings => triggers,
  });
  bus.register(PRIVATE_SOURCE);
  heard = [];
  bus.subscribe((signal) => {
    heard.push(signal);
  });
});

function reading(value: number, overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: LAMP,
    field: 'brightness',
    value,
    previous: null,
    at: new Date(now).toISOString(),
    profileId: null,
    data: {},
    ...overrides,
  };
}

function motion(subject: string): SignalInput {
  return reading(1, { source: 'event', kind: 'motion', subject, field: null, value: true });
}

function storms(): SignalInput[] {
  return heard.filter((signal) => signal.source === 'hub' && signal.kind === 'storm');
}

describe('signal bus rate cap', () => {
  it('delivers a burst, drops the excess and announces a storm once for the source', () => {
    for (let value = 1; value <= 40; value += 1) bus.emit(reading(value));
    const delivered = heard.filter((signal) => signal.source === 'device');
    expect(delivered).toHaveLength(10);
    expect(storms()).toHaveLength(1);
    expect(storms()[0]?.data).toStrictEqual({ source: 'device', kind: 'state', reason: 'cap' });
    expect(logs.events().filter((event) => event === 'signals.storm')).toHaveLength(1);
  });

  it('announces again after ten minutes and again for another source', () => {
    for (let value = 1; value <= 20; value += 1) bus.emit(reading(value));
    for (let index = 0; index < 20; index += 1) bus.emit(motion('camera-1'));
    expect(storms().map((signal) => signal.data['source'])).toStrictEqual(['device', 'event']);
    now += STORM_ANNOUNCE_INTERVAL_MS;
    for (let value = 21; value <= 60; value += 1) bus.emit(reading(value));
    expect(storms()).toHaveLength(3);
  });

  it('does not let repeated equal readings use up the cap of real changes', () => {
    bus.emit(reading(5));
    for (let index = 0; index < 100; index += 1) bus.emit(reading(5));
    for (let value = 6; value <= 10; value += 1) bus.emit(reading(value));
    expect(heard.filter((signal) => signal.source === 'device')).toHaveLength(6);
    expect(storms()).toHaveLength(0);
  });

  it('keeps the previous value on delivered state changes', () => {
    bus.emit(reading(1));
    bus.emit(reading(2));
    expect(heard.map((signal) => signal.previous)).toStrictEqual([null, 1]);
  });

  it('drops non-urgent pulses beyond the global limit yet still delivers the urgent storm notice', () => {
    for (let index = 0; index < 700; index += 1) bus.emit(motion(`camera-${String(index)}`));
    const delivered = heard.filter((signal) => signal.source === 'event');
    expect(delivered).toHaveLength(500);
    expect(logs.events()).toContain('signals.storm_global');
    expect(storms()).toHaveLength(1);
    expect(storms()[0]?.data['reason']).toBe('global');
  });

  it('survives a flood of ten thousand signals in one second with one storm line', () => {
    const started = performance.now();
    for (let index = 0; index < 10_000; index += 1) bus.emit(motion(`camera-${String(index)}`));
    expect(performance.now() - started).toBeLessThan(1000);
    expect(logs.events().filter((event) => event === 'signals.storm_global')).toHaveLength(1);
  });
});

describe('signal bus owner switches', () => {
  it('drops an off source and an off kind with no log and no storm', () => {
    triggers = { sources: { device: false }, kinds: { 'event/motion': false } };
    bus.emit(reading(1));
    bus.emit(motion('camera-1'));
    expect(heard).toHaveLength(0);
    expect(logs.records).toHaveLength(0);
  });

  it('delivers again when the switch goes back on, with no fake change for a repeat', () => {
    bus.emit(reading(1));
    triggers = { sources: { device: false }, kinds: {} };
    bus.emit(reading(2));
    triggers = DEFAULT_TRIGGER_SETTINGS;
    bus.emit(reading(2));
    expect(heard.map((signal) => signal.value)).toStrictEqual([1, 2]);
    expect(heard[1]?.previous).toBe(1);
  });

  it('keeps an opt-in kind off until it is switched on', () => {
    const secret: SignalInput = {
      source: 'plugin_secret',
      kind: 'private',
      subject: null,
      field: null,
      value: true,
      previous: null,
      at: new Date(now).toISOString(),
      profileId: null,
      data: {},
    };
    bus.emit(secret);
    expect(heard).toHaveLength(0);
    triggers = { sources: {}, kinds: { 'plugin_secret/private': true } };
    bus.emit(secret);
    expect(heard).toHaveLength(1);
  });
});

describe('signal bus occurrences', () => {
  it('drops a pulse repeating the same occurrence within a minute', () => {
    const first = { ...motion('camera-1'), data: { occurrence: 'abc' } };
    bus.emit(first);
    bus.emit(first);
    expect(heard).toHaveLength(1);
  });
});

describe('signal bus validation', () => {
  it('still refuses unregistered kinds and malformed signals loudly', () => {
    bus.emit({ ...reading(1), kind: 'nonsense' });
    bus.emit({ ...reading(1), at: 'yesterday' });
    expect(heard).toHaveLength(0);
    expect(logs.events()).toStrictEqual(['signals.unregistered', 'signals.invalid']);
  });
});
