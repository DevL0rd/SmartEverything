import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppViewRequest } from '@smarteverything/domain';
import { anchorForFocus } from '../components/highlight-keys';
import { emptyState } from '../store/state';
import { appViewResult, type AppViewPorts } from './app-view';

const HREFS: Readonly<Record<string, string>> = {
  section: '/fitness',
  device: '/lamp',
  room: '/den',
  setting: '/settings/app-updates',
};

vi.mock('./nav-targets', () => ({
  navTargetHref: (target: { readonly kind: string; readonly section?: string }): string | null =>
    target.section === 'talk' ? null : (HREFS[target.kind] ?? null),
  targetFactsOf: (target: { readonly kind: string }): { readonly title: string | null } => ({
    title:
      { section: 'Fitness', device: 'Lamp', room: 'Den', setting: 'Updates' }[target.kind] ?? null,
  }),
  settingTargetOf: (target: {
    readonly page: string;
    readonly setting: string | null;
  }): { readonly page: string; readonly row: string | null } => ({
    page: target.page,
    row: target.setting,
  }),
}));

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';

type OpenRequest = Extract<AppViewRequest, { readonly action: 'open' }>;
type HighlightRequest = Extract<AppViewRequest, { readonly action: 'highlight' }>;

function opened(target: OpenRequest['target'], focus: string | null = null): OpenRequest {
  return { requestId: REQUEST_ID, action: 'open', target, focus };
}

function pointed(focus: string): HighlightRequest {
  return { requestId: REQUEST_ID, action: 'highlight', focus };
}

interface Harness {
  readonly ports: AppViewPorts;
  readonly visited: unknown[];
  readonly asked: (readonly string[])[];
  readonly cleared: () => number;
}

interface Options {
  readonly inFront?: boolean;
  readonly onScreen?: readonly string[];
  readonly shows?: (until: AbortSignal) => Promise<boolean>;
}

function harness({ inFront = true, onScreen = [], shows }: Options = {}): Harness {
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
        resolve: (focus) => anchorForFocus(onScreen, focus),
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
    await expect(appViewResult(opened(FITNESS), ports)).resolves.toEqual({
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
    await expect(appViewResult(opened(DEVICE, 'brightness'), ports)).resolves.toEqual({
      ok: true,
      opened: 'Lamp',
      highlighted: true,
      reason: null,
    });
    expect(asked).toEqual([[`capability:${DEVICE_ID}:brightness`]]);
  });

  it('says the focus is unknown when the page never shows it', async () => {
    const { ports } = harness({ shows: () => Promise.resolve(false) });
    await expect(appViewResult(opened(DEVICE, 'steps'), ports)).resolves.toMatchObject({
      opened: 'Lamp',
      highlighted: false,
      reason: 'unknown_focus',
    });
  });

  it('says the focus is unknown for a page kind that has nothing to point at', async () => {
    const { ports, asked } = harness();
    await expect(appViewResult(opened(ROOM, 'lights'), ports)).resolves.toMatchObject({
      opened: 'Den',
      highlighted: false,
      reason: 'unknown_focus',
    });
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
    const answer = appViewResult(opened(DEVICE, 'brightness'), ports);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(answer).resolves.toMatchObject({ highlighted: false, reason: 'unknown_focus' });
  });

  it('refuses without navigating when the app is not in front', async () => {
    const { ports, visited } = harness({ inFront: false });
    await expect(appViewResult(opened(FITNESS), ports)).resolves.toEqual({
      ok: false,
      reason: 'app_not_in_front',
    });
    expect(visited).toEqual([]);
  });

  it('opens a settings page and points at the setting named by the focus', async () => {
    const { ports, visited, asked } = harness();
    const settings = { kind: 'setting', page: 'app-updates', setting: null } as const;
    await expect(appViewResult(opened(settings, 'updates'), ports)).resolves.toEqual({
      ok: true,
      opened: 'Updates',
      highlighted: true,
      reason: null,
    });
    expect(visited).toEqual(['/settings/app-updates']);
    expect(asked).toEqual([['setting:updates']]);
  });

  it('points at the targeted setting even when no separate focus was supplied', async () => {
    const { ports, visited, asked } = harness();
    const setting = {
      kind: 'setting',
      page: 'app-updates',
      setting: 'app-updates.android-installer',
    } as const;
    await expect(appViewResult(opened(setting), ports)).resolves.toMatchObject({
      opened: 'Updates',
      highlighted: true,
    });
    expect(visited).toEqual(['/settings/app-updates']);
    expect(asked).toEqual([['setting:app-updates.android-installer']]);
  });

  it('reads the focus as a row on the page, not a setting of another page', async () => {
    const { ports, asked } = harness();
    const settings = {
      kind: 'setting',
      page: 'app-updates',
      setting: 'app-updates.android-installer',
    } as const;
    await appViewResult(opened(settings, 'other-page.row'), ports);
    expect(asked).toEqual([['setting:other-page.row']]);
  });

  it('refuses a target the app has no page for', async () => {
    const { ports, visited } = harness();
    const gone = { kind: 'section', section: 'talk' } as const;
    await expect(appViewResult(opened(gone), ports)).resolves.toEqual({
      ok: false,
      reason: 'target_not_found',
    });
    expect(visited).toEqual([]);
  });
});

describe('pointing at something already on screen', () => {
  it.each([
    ['pin-1', 'nav:pin-1'],
    ['about.updates', 'setting:about.updates'],
    ['step-1', 'step:step-1'],
    ['brightness', `capability:${DEVICE_ID}:brightness`],
    [`${DEVICE_ID}:brightness`, `capability:${DEVICE_ID}:brightness`],
  ])('points at the mounted focus %s without navigating', async (focus, key) => {
    const { ports, asked, visited } = harness({ onScreen: [key] });
    await expect(appViewResult(pointed(focus), ports)).resolves.toEqual({
      ok: true,
      opened: null,
      highlighted: true,
      reason: null,
    });
    expect(asked).toEqual([[key]]);
    expect(visited).toEqual([]);
  });

  it('says it is not on screen without waiting when nothing registered', async () => {
    const { ports, asked } = harness();
    await expect(appViewResult(pointed('projectorButton'), ports)).resolves.toEqual({
      ok: true,
      opened: null,
      highlighted: false,
      reason: 'not_on_screen',
    });
    expect(asked).toEqual([]);
  });

  it('declines an unqualified capability shared by two devices on screen', async () => {
    const { ports, asked } = harness({
      onScreen: [`capability:${DEVICE_ID}:brightness`, `capability:${REQUEST_ID}:brightness`],
    });
    await expect(appViewResult(pointed('brightness'), ports)).resolves.toMatchObject({
      highlighted: false,
      reason: 'not_on_screen',
    });
    await expect(appViewResult(pointed(`${DEVICE_ID}:brightness`), ports)).resolves.toMatchObject({
      highlighted: true,
    });
    expect(asked).toEqual([[`capability:${DEVICE_ID}:brightness`]]);
  });

  it('does not point at a registered element while the app is in the background', async () => {
    const { ports, asked } = harness({ inFront: false, onScreen: ['setting:updates'] });
    await expect(appViewResult(pointed('updates'), ports)).resolves.toEqual({
      ok: false,
      reason: 'app_not_in_front',
    });
    expect(asked).toEqual([]);
  });
});

describe('dismissing', () => {
  it('clears the pointer and leaves the person where they are', async () => {
    const { ports, visited, cleared } = harness();
    await expect(
      appViewResult({ requestId: REQUEST_ID, action: 'dismiss', target: null, focus: null }, ports),
    ).resolves.toEqual({
      ok: true,
      opened: null,
      highlighted: false,
      reason: null,
    });
    expect(cleared()).toBe(1);
    expect(visited).toEqual([]);
  });
});
