import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfProbe, counted, timed } from '../perf/probe-kit';
import { probedScreen } from '../perf/screen-probe';
import { activateFlags } from './flags';
import { DEVELOPER_TOGGLES, allOff, resolveFlags } from './toggles';

beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
  activateFlags(allOff());
});

describe('developer toggles', () => {
  it('has unique ids and parents that come first', () => {
    const seen = new Set<string>();
    DEVELOPER_TOGGLES.forEach((toggle) => {
      expect(seen.has(toggle.id)).toBe(false);
      if (toggle.parent !== null) {
        expect(seen.has(toggle.parent)).toBe(true);
      }
      seen.add(toggle.id);
    });
  });

  it('is all off with nothing stored', () => {
    expect(Object.values(resolveFlags({}, true)).some(Boolean)).toBe(false);
    expect(Object.values(allOff()).some(Boolean)).toBe(false);
  });

  it('keeps a stored option off while its parent is off', () => {
    const flags = resolveFlags({ 'perf.stalls': true }, true);
    expect(flags['perf.stalls']).toBe(false);
    expect(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, true)['perf.stalls']).toBe(
      true,
    );
  });

  it('turns on only release toggles in a release build', () => {
    const all = Object.fromEntries(DEVELOPER_TOGGLES.map((toggle) => [toggle.id, true]));
    const flags = resolveFlags(all, false);
    DEVELOPER_TOGGLES.forEach((toggle) => {
      expect(flags[toggle.id]).toBe(toggle.release);
    });
  });
});

describe('gating while off', () => {
  it('returns children untouched', () => {
    const child = 'child';
    expect(PerfProbe({ id: 'x', children: child })).toBe(child);
    const screen = createElement('div');
    expect(probedScreen({ route: { name: 'a' }, children: screen })).toBe(screen);
  });

  it('returns the same handler and work result without wrapping', () => {
    const handler = (): void => undefined;
    expect(counted('id', handler)).toBe(handler);
    expect(timed('id', () => 7)).toBe(7);
  });
});

describe('gating while on', () => {
  it('wraps children in a profiler', () => {
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.profilers': true }, true));
    expect(PerfProbe({ id: 'x', children: 'child' })).not.toBe('child');
    const handler = (): void => undefined;
    expect(counted('id', handler)).not.toBe(handler);
  });
});
