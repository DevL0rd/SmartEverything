import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activateFlags } from '../developer/flags';
import { resolveFlags, type DeveloperFlags } from '../developer/toggles';
import { flushTimers, startPerf, stopPerf } from './install';
import { rememberScreen, sinkOf, type PerfSink } from './sink';

const started = vi.hoisted(() => {
  const sessions: { flags: DeveloperFlags; stop: () => void }[] = [];
  const screen = vi.fn();
  return { sessions, screen };
});

vi.mock('./impl/start', () => ({
  startProbe: (flags: DeveloperFlags): { sink: Partial<PerfSink>; stop: () => void } => {
    const stop = vi.fn();
    started.sessions.push({ flags, stop });
    return { sink: { screen: started.screen }, stop };
  },
}));

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.stubGlobal('__DEV__', false);
  started.sessions.length = 0;
  started.screen.mockClear();
  stopPerf();
  activateFlags(resolveFlags({ 'perf.sampling': true }, true));
});

describe('perf session', () => {
  it('attaches one session and replays the remembered screen', async () => {
    rememberScreen('home');
    startPerf();
    await settle();
    startPerf();
    await settle();
    expect(started.sessions).toHaveLength(1);
    expect(started.screen).toHaveBeenCalledWith('home');
    expect(sinkOf()).not.toBeNull();
  });

  it('stops the session when sampling is switched off', async () => {
    startPerf();
    await settle();
    activateFlags(resolveFlags({}, true));
    startPerf();
    expect(started.sessions[0]?.stop).toHaveBeenCalledTimes(1);
    expect(sinkOf()).toBeNull();
  });

  it('restarts with a fresh session when the options change', async () => {
    startPerf();
    await settle();
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, true));
    startPerf();
    await settle();
    expect(started.sessions).toHaveLength(2);
    expect(started.sessions[0]?.stop).toHaveBeenCalledTimes(1);
    expect(sinkOf()).not.toBeNull();
  });

  it('keeps enabled collectors through option changes and ignores unchanged flags', async () => {
    startPerf();
    await flushTimers();
    const flags = resolveFlags(
      { 'perf.sampling': true, 'perf.fanout': true, 'perf.nav': true, 'perf.upload': true },
      true,
    );
    activateFlags(flags);
    startPerf();
    await flushTimers();
    startPerf();
    await flushTimers();
    expect(started.sessions).toHaveLength(2);
    expect(started.sessions[1]?.flags).toEqual(flags);
  });

  it('drops a start that was stopped while loading', async () => {
    startPerf();
    stopPerf();
    await settle();
    expect(sinkOf()).toBeNull();
    expect(started.sessions).toEqual([]);
  });

  it('installs nothing while developer mode is off', async () => {
    activateFlags(resolveFlags({}, false));
    startPerf();
    await settle();
    expect(started.sessions).toEqual([]);
    expect(sinkOf()).toBeNull();
  });

  it('installs nothing for stored options while developer mode is off', async () => {
    activateFlags(resolveFlags({ 'perf.sampling': true, 'perf.stalls': true }, false));
    startPerf();
    await settle();
    expect(started.sessions).toEqual([]);
    expect(sinkOf()).toBeNull();
  });
});
