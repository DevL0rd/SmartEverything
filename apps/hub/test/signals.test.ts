import {
  SIGNAL_TRIGGER,
  windowValue,
  type SignalInput,
  type SignalTrigger,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SignalBus } from '../src/signals/bus';
import { SignalWatch } from '../src/signals/signal-watch';
import { FakeClock } from './support/fake-clock';
import { captureLogs, testLogger } from './support/logs';

const SENSOR = '1d000000-0000-4000-8000-000000000001';
const START = '2026-10-08T10:00:00.000Z';

function reading(value: number, at: string): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: SENSOR,
    field: 'temperature',
    value,
    previous: null,
    at,
    profileId: null,
    data: {},
  };
}

function watching(
  trigger: Partial<SignalTrigger>,
  pulse = false,
): { clock: FakeClock; fired: SignalInput[]; watch: SignalWatch } {
  const clock = new FakeClock(START);
  const fired: SignalInput[] = [];
  const watch = new SignalWatch({
    trigger: SIGNAL_TRIGGER.parse({
      type: 'signal',
      source: 'device',
      kind: 'state',
      subject: SENSOR,
      field: 'temperature',
      ...trigger,
    }),
    pulse,
    clock,
    fire: (signal): void => {
      fired.push(signal);
    },
  });
  return { clock, fired, watch };
}

function feed(setup: ReturnType<typeof watching>, value: number, iso: string): void {
  setup.clock.advanceTo(iso);
  setup.watch.observe(reading(value, iso));
}

describe('window values', () => {
  const samples = [
    { atMs: 0, value: 100 },
    { atMs: 30_000, value: 130 },
    { atMs: 60_000, value: 160 },
  ];

  it('aggregates numbers', () => {
    expect(windowValue('avg', samples)).toBe(130);
    expect(windowValue('min', samples)).toBe(100);
    expect(windowValue('max', samples)).toBe(160);
    expect(windowValue('count', samples)).toBe(3);
    expect(windowValue('rate', samples)).toBe(60);
  });

  it('has no value without numbers', () => {
    expect(windowValue('avg', [])).toBeNull();
    expect(windowValue('rate', [{ atMs: 0, value: 1 }])).toBeNull();
  });
});

describe('signal watch', () => {
  it('fires once when the average crosses and stays true for the hold time', () => {
    const setup = watching({
      comparison: { operator: 'gt', value: 140 },
      window: { mode: 'avg', seconds: 60 },
      holdSeconds: 30,
    });
    feed(setup, 150, '2026-10-08T10:00:01.000Z');
    feed(setup, 150, '2026-10-08T10:00:10.000Z');
    expect(setup.fired).toHaveLength(0);
    setup.clock.advanceTo('2026-10-08T10:00:32.000Z');
    expect(setup.fired).toHaveLength(1);
    feed(setup, 152, '2026-10-08T10:00:40.000Z');
    expect(setup.fired).toHaveLength(1);
  });

  it('cancels the hold when the value drops back', () => {
    const setup = watching({ comparison: { operator: 'gt', value: 140 }, holdSeconds: 30 });
    feed(setup, 150, '2026-10-08T10:00:01.000Z');
    feed(setup, 120, '2026-10-08T10:00:10.000Z');
    setup.clock.advanceTo('2026-10-08T10:01:00.000Z');
    expect(setup.fired).toHaveLength(0);
  });

  it('waits for bursts to settle before deciding', () => {
    const setup = watching({ comparison: { operator: 'gt', value: 140 }, debounceSeconds: 5 });
    feed(setup, 150, '2026-10-08T10:00:01.000Z');
    feed(setup, 120, '2026-10-08T10:00:03.000Z');
    setup.clock.advanceTo('2026-10-08T10:00:20.000Z');
    expect(setup.fired).toHaveLength(0);
    feed(setup, 150, '2026-10-08T10:00:21.000Z');
    setup.clock.advanceTo('2026-10-08T10:00:27.000Z');
    expect(setup.fired).toHaveLength(1);
  });

  it('does not repeat within the cooldown', () => {
    const setup = watching({ cooldownSeconds: 60 }, true);
    feed(setup, 1, '2026-10-08T10:00:01.000Z');
    feed(setup, 1, '2026-10-08T10:00:30.000Z');
    feed(setup, 1, '2026-10-08T10:01:02.000Z');
    expect(setup.fired).toHaveLength(2);
  });

  it('re-arms a count window when old samples expire', () => {
    const setup = watching(
      { comparison: { operator: 'gte', value: 2 }, window: { mode: 'count', seconds: 60 } },
      true,
    );
    feed(setup, 1, '2026-10-08T10:00:01.000Z');
    feed(setup, 1, '2026-10-08T10:00:02.000Z');
    expect(setup.fired).toHaveLength(1);
    setup.clock.advanceTo('2026-10-08T10:02:00.000Z');
    feed(setup, 1, '2026-10-08T10:02:01.000Z');
    feed(setup, 1, '2026-10-08T10:02:02.000Z');
    expect(setup.fired).toHaveLength(2);
  });

  it('ignores other subjects', () => {
    const setup = watching({}, true);
    setup.watch.observe({ ...reading(1, START), subject: null });
    expect(setup.fired).toHaveLength(0);
  });
});

describe('signal bus', () => {
  it('drops and logs unregistered kinds', () => {
    const logs = captureLogs();
    const bus = new SignalBus({ log: testLogger() });
    const heard: SignalInput[] = [];
    bus.subscribe((signal) => {
      heard.push(signal);
    });
    bus.emit({ ...reading(1, START), kind: 'nonsense' });
    bus.emit(reading(1, START));
    expect(heard).toHaveLength(1);
    expect(logs.events()).toContain('signals.unregistered');
  });
});
