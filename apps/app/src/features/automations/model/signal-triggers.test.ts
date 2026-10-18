import { describe, expect, it } from 'vitest';
import { SIGNAL_SOURCES, type SignalTriggerV2 } from '@smarteverything/domain';
import {
  blankSignal,
  formOf,
  genericSources,
  signalOf,
  timingOf,
  windowModesFor,
  withTiming,
} from './signal-triggers';

const DEVICE: SignalTriggerV2 = {
  on: 'signal',
  source: 'device',
  kind: 'state',
  subject: '00000000-0000-4000-8000-000000000001',
  field: 'pm25',
  test: { is: 'gt', to: 20 },
};

describe('signal trigger forms', () => {
  it('tells device, event, weather and other signals apart', () => {
    expect(formOf(DEVICE)).toBe('device');
    expect(formOf({ on: 'signal', source: 'event', kind: 'motion' })).toBe('event');
    expect(formOf({ on: 'signal', source: 'weather', kind: 'forecast' })).toBe('weather');
    expect(formOf({ on: 'signal', source: 'health', kind: 'x' })).toBe('generic');
  });

  it('offers the generic sources without the ones with their own form', () => {
    const names = genericSources().map((source) => source.source);
    expect(names).not.toContain('device');
    expect(names).not.toContain('event');
    expect(names).not.toContain('weather');
    expect(names.length).toBeGreaterThan(0);
  });

  it('starts a signal of a chosen kind with "changed" and drops filters that no longer fit', () => {
    const source = SIGNAL_SOURCES.find((entry) => entry.kinds.some((kind) => !kind.pulse));
    const kind = source?.kinds.find((entry) => !entry.pulse);
    if (source === undefined || kind === undefined) throw new Error('A non-pulse signal exists');
    const made = signalOf(source.source, kind);
    expect(made.test).toEqual({ is: 'changed' });
    expect(blankSignal()?.on).toBe('signal');
  });
});

const NO_TIMING = {
  window: null,
  atLeast: 2,
  debounceSeconds: 0,
  holdSeconds: 0,
  cooldownSeconds: 0,
} as const;

describe('signal timing', () => {
  it('reads no timing from a plain trigger', () => {
    expect(timingOf(DEVICE)).toEqual(NO_TIMING);
  });

  it('writes only the timing that is on, and removes it again', () => {
    const timed = withTiming(DEVICE, {
      ...NO_TIMING,
      holdSeconds: 30,
      cooldownSeconds: 600,
      window: { of: 'avg', seconds: 120 },
    });
    expect(timed).toMatchObject({ holdSeconds: 30, cooldownSeconds: 600, window: { of: 'avg' } });
    expect('debounceSeconds' in timed).toBe(false);
    const plain = withTiming(timed, NO_TIMING);
    expect(plain).toEqual(DEVICE);
  });

  it('keeps the "at least N times" of a count window in the test', () => {
    const counted = withTiming(
      { on: 'signal', source: 'event', kind: 'motion' },
      { ...NO_TIMING, window: { of: 'count', seconds: 60 }, atLeast: 4 },
    );
    expect(counted.test).toEqual({ is: 'gte', to: 4 });
    expect(timingOf(counted).atLeast).toBe(4);
  });

  it('allows a window only where it makes sense', () => {
    expect(windowModesFor('event', null)).toEqual(['count']);
    expect(windowModesFor('weather', null)).toEqual([]);
    expect(windowModesFor('device', { kind: 'boolean' })).toEqual([]);
    expect(windowModesFor('device', { kind: 'number', min: 0, max: 1, step: 1 })).toContain('avg');
  });
});
