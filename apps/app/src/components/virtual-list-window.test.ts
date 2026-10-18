import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from '../design/screen-pause';

const windows = vi.hoisted((): number[] => []);

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({ drawDistance }: { readonly drawDistance: number }): null => {
    windows.push(drawDistance);
    return null;
  },
}));

const { VirtualList, DRAW_DISTANCE, PAUSED_DRAW_DISTANCE, DRAW_STEP } =
  await import('./virtual-list');

let frames: (() => void)[] = [];
let root: Root | null = null;

function nextFrame(): void {
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  });
}

function mountUnder(pause: ScreenPause): void {
  const list = createElement(VirtualList<string>, {
    sections: [{ key: 'all', title: '', data: ['a', 'b'] }],
    keyOf: (item: string) => item,
    renderItem: (item: string): ReactElement => createElement('span', null, item),
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const mounted = root;
  act(() => {
    mounted.render(createElement(ScreenPausedContext, { value: pause }, list));
  });
}

function lastWindow(): number | undefined {
  return windows.at(-1);
}

beforeEach(() => {
  windows.length = 0;
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
});

afterEach(() => {
  nextFrame();
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

function settle(): void {
  for (let frame = 0; frame < 20; frame += 1) nextFrame();
}

describe('a virtual list on a screen that is not shown', () => {
  it('keeps a short draw distance until it is first shown', () => {
    mountUnder(new ScreenPause(null, true));
    expect(lastWindow()).toBe(PAUSED_DRAW_DISTANCE);
  });

  it('grows to the full draw distance one step per frame, never in one commit', () => {
    const pause = new ScreenPause(null, true);
    mountUnder(pause);
    act(() => {
      pause.setOwn(false);
    });
    settle();
    expect(lastWindow()).toBe(DRAW_DISTANCE);
    const jumps = windows.slice(1).map((size, index) => size - (windows[index] ?? 0));
    expect(Math.max(...jumps)).toBeLessThanOrEqual(DRAW_STEP);
    expect(windows).toContain(PAUSED_DRAW_DISTANCE + DRAW_STEP);
  });

  it('keeps its full draw distance once shown, so leaving and coming back mounts no cells again', () => {
    const pause = new ScreenPause(null, true);
    mountUnder(pause);
    act(() => {
      pause.setOwn(false);
    });
    settle();
    act(() => {
      pause.setOwn(true);
    });
    settle();
    expect(lastWindow()).toBe(DRAW_DISTANCE);
    expect(windows.at(-1)).toBe(DRAW_DISTANCE);
    expect(windows.slice(windows.indexOf(DRAW_DISTANCE))).toEqual(
      windows.slice(windows.indexOf(DRAW_DISTANCE)).map(() => DRAW_DISTANCE),
    );
  });

  it('uses the full draw distance from the start on a screen that mounts shown', () => {
    mountUnder(new ScreenPause(null));
    expect(windows).not.toContain(PAUSED_DRAW_DISTANCE);
    expect(windows.at(-1)).toBe(DRAW_DISTANCE);
  });
});
