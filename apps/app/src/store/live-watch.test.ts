import type { LiveClientMessageInput, ProcessWindow } from '@smarteverything/domain';
import { WATCH_DEBOUNCE_MS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause } from '../design/screen-pause';
import { LiveWatchRegistry, holdWhileLive } from './live-watch';

const PC = '11111111-1111-4111-8111-111111111111';
const HUB = '22222222-2222-4222-8222-222222222222';
const WINDOW: ProcessWindow = {
  sort: 'cpu',
  order: 'descending',
  tree: false,
  gpu: false,
  offset: 0,
  limit: 40,
};

function connected(): { watch: LiveWatchRegistry; sent: LiveClientMessageInput[] } {
  const watch = new LiveWatchRegistry();
  const sent: LiveClientMessageInput[] = [];
  watch.attach((message) => sent.push(message));
  sent.length = 0;
  return { watch, sent };
}

describe('the live demand registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one replace-set message after the debounce for any number of holds', () => {
    const { watch, sent } = connected();
    watch.hold(PC, ['cpu', 'summary']);
    watch.hold(PC, ['cpu', 'memory']);
    watch.hold(HUB, ['summary']);
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toStrictEqual([
      {
        type: 'watch',
        demands: [
          { deviceId: PC, topics: ['cpu', 'memory', 'summary'] },
          { deviceId: HUB, topics: ['summary'] },
        ],
      },
    ]);
  });

  it('keeps a topic while any holder wants it and drops it with the last', () => {
    const { watch, sent } = connected();
    const first = watch.hold(PC, ['cpu']);
    const second = watch.hold(PC, ['cpu', 'gpu']);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    sent.length = 0;
    second();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toStrictEqual([{ type: 'watch', demands: [{ deviceId: PC, topics: ['cpu'] }] }]);
    first();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent[1]).toStrictEqual({ type: 'watch', demands: [] });
  });

  it('sends nothing when a change leaves the demand set the same', () => {
    const { watch, sent } = connected();
    const first = watch.hold(PC, ['cpu']);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    sent.length = 0;
    const second = watch.hold(PC, ['cpu']);
    first();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    second();
    watch.hold(PC, ['cpu']);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toHaveLength(0);
  });

  it('sends nothing at all when nobody ever watched', () => {
    const { watch, sent } = connected();
    watch.hold(PC, ['cpu'])();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS * 5);
    expect(sent).toHaveLength(0);
  });

  it('carries the process window of the latest holder', () => {
    const { watch, sent } = connected();
    watch.hold(PC, ['processes'], WINDOW);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent[0]).toStrictEqual({
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['processes'], processes: WINDOW }],
    });
  });

  it('replays the held set at once on reconnect and sends nothing while detached', () => {
    const { watch, sent } = connected();
    watch.hold(PC, ['summary']);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    watch.detach();
    sent.length = 0;
    watch.hold(HUB, ['cpu']);
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS * 3);
    expect(sent).toHaveLength(0);
    watch.attach((message) => sent.push(message));
    expect(sent).toStrictEqual([
      {
        type: 'watch',
        demands: [
          { deviceId: PC, topics: ['summary'] },
          { deviceId: HUB, topics: ['cpu'] },
        ],
      },
    ]);
  });

  it('tells followers when a device gains its first and loses its last holder', () => {
    const { watch } = connected();
    const told: string[] = [];
    watch.follow((deviceId, demanded) => told.push(`${deviceId}:${String(demanded)}`));
    const first = watch.hold(PC, ['cpu']);
    const second = watch.hold(PC, ['gpu']);
    first();
    expect(told).toStrictEqual([`${PC}:true`]);
    second();
    expect(told).toStrictEqual([`${PC}:true`, `${PC}:false`]);
  });

  it('ignores a hold without topics', () => {
    const { watch, sent } = connected();
    watch.hold(PC, [])();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(sent).toHaveLength(0);
    expect(watch.topicsOf(PC).size).toBe(0);
  });
});

describe('holding demand only while the screen is live', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function counted(): { taken: () => number; held: () => number; take: () => () => void } {
    let taken = 0;
    let held = 0;
    return {
      taken: () => taken,
      held: () => held,
      take: () => {
        taken += 1;
        held += 1;
        return (): void => {
          held -= 1;
        };
      },
    };
  }

  it('holds on a live screen, releases when it pauses and again when it resumes', () => {
    const frames: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
    const pause = new ScreenPause(null);
    pause.attach();
    const { take, held, taken } = counted();
    const stop = holdWhileLive(pause, take);
    expect(held()).toBe(1);
    pause.setOwn(true);
    expect(held()).toBe(0);
    pause.setOwn(false);
    for (const frame of frames.splice(0)) frame();
    expect(held()).toBe(1);
    expect(taken()).toBe(2);
    stop();
    expect(held()).toBe(0);
  });

  it('never holds on a screen that starts paused', () => {
    const pause = new ScreenPause(null);
    pause.attach();
    pause.setOwn(true);
    const { take, taken } = counted();
    const stop = holdWhileLive(pause, take);
    expect(taken()).toBe(0);
    stop();
  });
});
