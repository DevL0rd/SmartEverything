import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activateFlags } from '../developer/flags';
import { resolveFlags } from '../developer/toggles';
import { startPerf, stopPerf } from './install';
import { rememberScreen, sinkOf, type PerfSink } from './sink';

const started = vi.hoisted(() => {
  const sessions: { stop: () => void }[] = [];
  const screen = vi.fn();
  return { sessions, screen };
});

vi.mock('./impl/start', () => ({
  startProbe: (): { sink: Partial<PerfSink>; stop: () => void } => {
    const stop = vi.fn();
    started.sessions.push({ stop });
    return { sink: { screen: started.screen }, stop };
  },
}));

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.stubGlobal('__DEV__', true);
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

  it('drops a start that was stopped while loading', async () => {
    startPerf();
    stopPerf();
    await settle();
    expect(sinkOf()).toBeNull();
  });
});
