import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateFlags } from '../developer/flags';
import { resolveFlags } from '../developer/toggles';
import { flushTimers, startPerf, stopPerf } from './install';
import { sinkOf } from './sink';

const spies = vi.hoisted(() => ({
  subscribe: vi.fn((): { remove: () => void } => ({ remove: () => undefined })),
}));

const timers = vi.hoisted(() => ({ count: 0 }));

const originalInterval = globalThis.setInterval;

vi.mock('./impl/globals', () => ({ patchGlobals: (): (() => void) => () => undefined }));

vi.mock('./impl/flush', () => ({ makeFlush: (): (() => void) => () => undefined }));

vi.mock('react-native', () => ({
  AppState: { addEventListener: spies.subscribe },
  DeviceEventEmitter: { addListener: spies.subscribe },
  Keyboard: { addListener: spies.subscribe },
  Platform: { OS: 'android', select: (options: { android?: unknown }): unknown => options.android },
}));

vi.mock('expo', () => ({ requireOptionalNativeModule: (): null => null }));

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function used(): number {
  return timers.count + spies.subscribe.mock.calls.length;
}

beforeEach(() => {
  timers.count = 0;
  spies.subscribe.mockClear();
  vi.spyOn(globalThis, 'setInterval').mockImplementation((run, ms) => {
    timers.count += 1;
    return originalInterval(run, ms);
  });
  stopPerf();
});

afterEach(() => {
  stopPerf();
  vi.unstubAllGlobals();
});

describe('developer mode off', () => {
  it('does not install stale collectors when flags change during startup', async () => {
    vi.stubGlobal('__DEV__', false);
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, true));
    startPerf();
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.stalls': false }, true));
    startPerf();
    await flushTimers();
    expect(sinkOf()).not.toBeNull();
    expect(timers.count).toBe(1);
    expect(spies.subscribe).not.toHaveBeenCalled();
  });

  it('installs no collector, no timer and no listener whatever is stored', async () => {
    vi.stubGlobal('__DEV__', false);
    const stored = {
      'perf.sampling': true,
      'perf.stalls': true,
      'perf.network': true,
      'perf.renders': true,
    };
    activateFlags(resolveFlags(stored, false));
    startPerf();
    await settle();
    expect(sinkOf()).toBeNull();
    expect(used()).toBe(0);
  });

  it('stops the running collector and its timers once the switch goes off', async () => {
    vi.stubGlobal('__DEV__', false);
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, true));
    startPerf();
    await flushTimers();
    expect(sinkOf()).not.toBeNull();
    expect(used()).toBeGreaterThan(0);
    timers.count = 0;
    spies.subscribe.mockClear();
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, false));
    startPerf();
    await flushTimers();
    expect(sinkOf()).toBeNull();
    expect(timers.count).toBe(0);
    expect(spies.subscribe).toHaveBeenCalledTimes(0);
  });
});
