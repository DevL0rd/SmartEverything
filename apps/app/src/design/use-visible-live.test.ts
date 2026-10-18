import { createElement, createRef, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const screen = vi.hoisted((): { visible: boolean; focused: boolean; foreground: boolean } => ({
  visible: true,
  focused: true,
  foreground: true,
}));

vi.mock('./visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: screen.visible,
    onLayout: undefined,
  }),
}));

vi.mock('./animation-gate', () => ({
  useScreenLive: (): { focused: boolean; foreground: boolean } => ({
    focused: screen.focused,
    foreground: screen.foreground,
  }),
}));

const { isVisibleLive, useVisibleLive } = await import('./use-visible-live');

function liveFor(visible: boolean, focused: boolean, foreground: boolean): boolean {
  screen.visible = visible;
  screen.focused = focused;
  screen.foreground = foreground;
  const seen: boolean[] = [];
  const Probe = (): ReactNode => {
    seen.push(useVisibleLive(createRef()).live);
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  return seen.at(-1) === true;
}

const TABLE: readonly (readonly [boolean, boolean, boolean])[] = [
  [false, false, false],
  [false, false, true],
  [false, true, false],
  [false, true, true],
  [true, false, false],
  [true, false, true],
  [true, true, false],
  [true, true, true],
];

describe('visible live gate', () => {
  beforeEach(() => {
    screen.visible = true;
    screen.focused = true;
    screen.foreground = true;
  });

  for (const [visible, focused, foreground] of TABLE) {
    const expected = visible && focused && foreground;
    it(`is ${String(expected)} when on screen ${String(visible)}, focused ${String(focused)}, foreground ${String(foreground)}`, () => {
      expect(isVisibleLive(visible, focused, foreground)).toBe(expected);
      expect(liveFor(visible, focused, foreground)).toBe(expected);
    });
  }
});
