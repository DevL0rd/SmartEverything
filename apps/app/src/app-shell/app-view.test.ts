import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppViewRequest } from '@smarteverything/domain';
import { emptyState } from '../store/state';
import { appViewResult, type AppViewPorts } from './app-view';

const HREFS: Readonly<Record<string, string>> = {
  section: '/fitness',
  device: '/lamp',
  room: '/den',
};

vi.mock('./nav-targets', () => ({
  navTargetHref: (target: { readonly kind: string; readonly section?: string }): string | null =>
    target.section === 'talk' ? null : (HREFS[target.kind] ?? null),
  targetFactsOf: (target: { readonly kind: string }): { readonly title: string | null } => ({
    title: { section: 'Fitness', device: 'Lamp', room: 'Den' }[target.kind] ?? null,
  }),
  settingTargetOf: (): null => null,
}));

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';

function request(parts: Partial<AppViewRequest>): AppViewRequest {
  return { requestId: REQUEST_ID, action: 'open', target: null, focus: null, ...parts };
}

interface Harness {
  readonly ports: AppViewPorts;
  readonly visited: unknown[];
  readonly asked: (readonly string[])[];
  readonly cleared: () => number;
}

interface Options {
  readonly inFront?: boolean;
  readonly onScreen?: boolean;
  readonly shows?: (until: AbortSignal) => Promise<boolean>;
}

function harness({ inFront = true, onScreen = false, shows }: Options = {}): Harness {
  const visited: unknown[] = [];
  const asked: (readonly string[])[] = [];
  let cleared = 0;
  return {
    visited,
    asked,
    cleared: () => cleared,
    ports: {
      inFront: () => inFront,
      state: () => emptyState(),
      navigate: (target): void => {
        visited.push(target);
      },
      highlight: {
        present: () => onScreen,
        show: (keys, until): Promise<boolean> => {
          asked.push(keys);
          return shows === undefined ? Promise.resolve(true) : shows(until);
        },
        clear: (): void => {
          cleared += 1;
        },
      },
    },
  };
}

const FITNESS = { kind: 'section', section: 'fitness' } as const;
const DEVICE = { kind: 'device', deviceId: DEVICE_ID, focus: null } as const;
const ROOM = { kind: 'room', roomId: DEVICE_ID } as const;

afterEach(() => {
  vi.useRealTimers();
});

describe('opening something in the app', () => {
  it('opens the page and says what was opened without pointing at anything', async () => {
    const { ports, visited, asked } = harness();
    await expect(appViewResult(request({ target: FITNESS }), ports)).resolves.toEqual({
      ok: true,
      opened: 'Fitness',
      highlighted: false,
      reason: null,
    });
    expect(visited).toEqual(['/fitness']);
    expect(asked).toEqual([]);
  });

  it('points at the capability named by the focus on a device page', async () => {
    const { ports, asked } = harness();
    await expect(
      appViewResult(request({ target: DEVICE, focus: 'brightness' }), ports),
    ).resolves.toEqual({ ok: true, opened: 'Lamp', highlighted: true, reason: null });
    expect(asked).toEqual([[`capability:${DEVICE_ID}:brightness`]]);
  });

  it('says the focus is unknown when the page never shows it', async () => {
    const { ports } = harness({ shows: () => Promise.resolve(false) });
    await expect(
      appViewResult(request({ target: DEVICE, focus: 'steps' }), ports),
    ).resolves.toMatchObject({ opened: 'Lamp', highlighted: false, reason: 'unknown_focus' });
  });

  it('says the focus is unknown for a page kind that has nothing to point at', async () => {
    const { ports, asked } = harness();
    await expect(
      appViewResult(request({ target: ROOM, focus: 'lights' }), ports),
    ).resolves.toMatchObject({ opened: 'Den', highlighted: false, reason: 'unknown_focus' });
    expect(asked).toEqual([]);
  });

  it('stops waiting for the element before the hub gives up on the answer', async () => {
    vi.useFakeTimers();
    const { ports } = harness({
      shows: (until) =>
        new Promise((resolve) => {
          until.addEventListener('abort', () => {
            resolve(false);
          });
        }),
    });
    const answer = appViewResult(request({ target: DEVICE, focus: 'brightness' }), ports);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(answer).resolves.toMatchObject({ highlighted: false, reason: 'unknown_focus' });
  });

  it('refuses without navigating when the app is not in front', async () => {
    const { ports, visited } = harness({ inFront: false });
    await expect(appViewResult(request({ target: FITNESS }), ports)).resolves.toEqual({
      ok: false,
      reason: 'app_not_in_front',
    });
    expect(visited).toEqual([]);
  });

  it('refuses a missing target, a navigation item target and a target that is gone', async () => {
    const { ports, visited } = harness();
    const gone = { kind: 'section', section: 'talk' } as const;
    const navItem = { kind: 'nav', node: 'lamp' } as const;
    for (const target of [null, navItem, gone]) {
      await expect(appViewResult(request({ target }), ports)).resolves.toEqual({
        ok: false,
        reason: 'target_not_found',
      });
    }
    expect(visited).toEqual([]);
  });
});

describe('pointing at something already on screen', () => {
  it('points at the tile of a device that is on screen', async () => {
    const { ports, asked, visited } = harness({ onScreen: true });
    await expect(
      appViewResult(request({ action: 'highlight', target: DEVICE }), ports),
    ).resolves.toEqual({ ok: true, opened: null, highlighted: true, reason: null });
    expect(asked).toEqual([[`tile:device:${DEVICE_ID}`]]);
    expect(visited).toEqual([]);
  });

  it('says it is not on screen without waiting when nothing registered', async () => {
    const { ports, asked } = harness({ onScreen: false });
    await expect(
      appViewResult(request({ action: 'highlight', target: FITNESS }), ports),
    ).resolves.toEqual({ ok: true, opened: null, highlighted: false, reason: 'not_on_screen' });
    expect(asked).toEqual([]);
  });

  it('points at a navigation item by its node', async () => {
    const { ports, asked } = harness({ onScreen: true });
    await appViewResult(
      request({ action: 'highlight', target: { kind: 'nav', node: 'pin-1' } }),
      ports,
    );
    expect(asked).toEqual([['nav:pin-1']]);
  });

  it('refuses a highlight without a target', async () => {
    const { ports } = harness();
    await expect(appViewResult(request({ action: 'highlight' }), ports)).resolves.toEqual({
      ok: false,
      reason: 'target_not_found',
    });
  });
});

describe('dismissing', () => {
  it('clears the pointer and leaves the person where they are', async () => {
    const { ports, visited, cleared } = harness();
    await expect(appViewResult(request({ action: 'dismiss' }), ports)).resolves.toEqual({
      ok: true,
      opened: null,
      highlighted: false,
      reason: null,
    });
    expect(cleared()).toBe(1);
    expect(visited).toEqual([]);
  });
});
