import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    View: ({
      children,
      className,
    }: {
      readonly children?: ReactNode;
      readonly className?: string;
    }): ReactNode => createElement('div', { 'data-paint': className }, children),
  };
});

vi.mock('../design/platform', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, isNative: (): boolean => false };
});

const { screenPause } = await import('./screen-pause');
const { wakeTab } = await import('./tab-prewarm');

interface Layer {
  readonly type: 'tab' | 'stack';
  readonly index: number;
  readonly names: readonly string[];
}

function navigationOf(layer: Layer): Parameters<typeof screenPause>[0]['navigation'] {
  const state = {
    key: `${layer.type}-state`,
    type: layer.type,
    index: layer.index,
    routeNames: [...layer.names],
    routes: layer.names.map((name) => ({ key: `${layer.type}-${name}`, name })),
  };
  return {
    getState: () => state,
    preload: (): void => undefined,
    dispatch: (): void => undefined,
    addListener: () => (): void => undefined,
    isFocused: () => false,
  };
}

function paintOf(layer: Layer, name: string): string {
  const element: ReactElement = createElement('section', { id: name });
  const markup = renderToStaticMarkup(
    screenPause({
      route: { key: `${layer.type}-${name}`, name },
      options: {},
      navigation: navigationOf(layer),
      children: element,
    }),
  );
  return /data-paint="([^"]*)"/.exec(markup)?.[1] ?? 'unwrapped';
}

describe('screens kept mounted behind the shown one on the web', () => {
  const tabs: Layer = { type: 'tab', index: 0, names: ['home', 'devices'] };

  it('paints the shown tab', () => {
    expect(paintOf(tabs, 'home').split(' ')).not.toContain('invisible');
  });

  it('does not paint a prewarmed tab, so its layers never reach the compositor', () => {
    wakeTab('tab-devices');
    expect(paintOf(tabs, 'devices').split(' ')).toEqual(['contents', 'invisible']);
  });

  it('does not paint the stack screen under the top one', () => {
    const stack: Layer = { type: 'stack', index: 1, names: ['list', 'detail'] };
    expect(paintOf(stack, 'list').split(' ')).toContain('invisible');
    expect(paintOf(stack, 'detail').split(' ')).not.toContain('invisible');
  });

  it('wraps every screen without a box of its own, so hiding never moves layout', () => {
    expect(paintOf(tabs, 'home').split(' ')).toEqual(['contents']);
  });
});
