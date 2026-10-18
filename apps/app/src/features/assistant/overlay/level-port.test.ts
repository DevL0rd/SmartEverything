import { describe, expect, it, vi } from 'vitest';
import { OVERLAY_HIDDEN, type OverlayView } from '@smarteverything/domain';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { CALM_LEVEL_MS, LevelPort } = await import('./level-port');
import type { LevelChannel } from './level-port';

interface Levels {
  readonly in: number;
  readonly out: number;
}

interface Rig {
  readonly port: InstanceType<typeof LevelPort>;
  readonly posted: { in: number; out: number }[];
  readonly listeners: Set<(levels: Levels) => void>;
  readonly opened: () => number;
  readonly closed: () => number;
  readonly emit: (levels: Levels, after?: number) => void;
  readonly advance: (ms: number) => void;
}

function rig(): Rig {
  let now = 0;
  const posted: { in: number; out: number }[] = [];
  const timers: { at: number; run: () => void }[] = [];
  const listeners = new Set<(levels: Levels) => void>();
  let opened = 0;
  let closed = 0;
  const port = new LevelPort({
    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    open: (): LevelChannel => {
      opened += 1;
      return {
        post: (message): void => {
          posted.push({ in: message.in, out: message.out });
        },
        close: (): void => {
          closed += 1;
        },
      };
    },
    now: (): number => now,
    after: (ms, run): (() => void) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return (): void => {
        timers.splice(timers.indexOf(timer), 1);
      };
    },
  });
  return {
    port,
    posted,
    listeners,
    opened: () => opened,
    closed: () => closed,
    emit: (levels, after = 0): void => {
      now += after;
      for (const listener of listeners) listener(levels);
    },
    advance: (ms): void => {
      now += ms;
      for (const timer of timers.filter((each) => each.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
  };
}

const view = (change: Partial<OverlayView>): OverlayView => ({
  ...OVERLAY_HIDDEN,
  state: 'speaking',
  level: 'output',
  ...change,
});

describe('the level port', () => {
  it('listens only while a level source is shown', () => {
    const { port, listeners } = rig();
    port.follow(null, 'c');
    port.follow(view({ level: null }), 'c');
    port.follow(view({ state: 'hidden' }), 'c');
    expect(listeners.size).toBe(0);
    port.follow(view({}), 'c');
    expect(listeners.size).toBe(1);
  });

  it('posts every event in full mode', () => {
    const { port, posted, emit } = rig();
    port.follow(view({ mode: 'full' }), 'c');
    emit({ in: 0.1, out: 0.5 }, 1);
    emit({ in: 0.2, out: 0.6 }, 1);
    expect(posted).toEqual([
      { in: 0.1, out: 0.5 },
      { in: 0.2, out: 0.6 },
    ]);
  });

  it('posts at most ten times a second in share and compact mode and keeps the last value', () => {
    const { port, posted, emit, advance } = rig();
    port.follow(view({ mode: 'share' }), 'c');
    emit({ in: 0, out: 0.1 }, 1000);
    emit({ in: 0, out: 0.2 }, 20);
    emit({ in: 0, out: 0.3 }, 20);
    expect(posted).toHaveLength(1);
    advance(CALM_LEVEL_MS);
    expect(posted.map((each) => each.out)).toEqual([0.1, 0.3]);
  });

  it('sends silence and stops listening when the source goes away', () => {
    const { port, posted, listeners, emit } = rig();
    port.follow(view({}), 'c');
    emit({ in: 0, out: 0.4 }, 1);
    port.follow(view({ level: null, state: 'thinking' }), 'c');
    expect(listeners.size).toBe(0);
    expect(posted.at(-1)).toEqual({ in: 0, out: 0 });
  });

  it('opens one channel per call and closes it with the call', () => {
    const { port, opened, closed } = rig();
    port.follow(view({}), 'one');
    port.follow(view({ level: null }), 'one');
    port.follow(view({}), 'one');
    expect(opened()).toBe(1);
    port.follow(view({}), 'two');
    expect(opened()).toBe(2);
    expect(closed()).toBe(1);
    port.close();
    expect(closed()).toBe(2);
  });
});
