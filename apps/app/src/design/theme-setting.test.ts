import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CLIENT_PREFS } from '@smarteverything/domain';
import type * as Theme from './theme';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => ({ themes: 0, variables: 0 }));

vi.mock('react-native', () => ({
  Dimensions: {
    get: (): { width: number } => ({ width: 400 }),
    addEventListener: (): { remove: () => undefined } => ({ remove: (): undefined => undefined }),
  },
  Platform: { OS: 'android' },
}));

vi.mock('uniwind', () => ({
  Uniwind: {
    themes: ['dark', 'light'],
    setTheme: (): void => {
      writes.themes += 1;
    },
    updateCSSVariables: (): void => {
      writes.variables += 1;
    },
  },
}));

const renders = { motion: 0, density: 0, accent: 0 };

async function load(): Promise<typeof Theme> {
  vi.resetModules();
  return import('./theme');
}

function mountReaders(theme: typeof Theme): void {
  const Motion = (): ReactNode => {
    renders.motion += 1;
    theme.useThemeSetting('motion');
    return null;
  };
  const Density = (): ReactNode => {
    renders.density += 1;
    theme.useThemeSetting('density');
    return null;
  };
  const Accent = (): ReactNode => {
    renders.accent += 1;
    theme.useThemeSetting('accent');
    return null;
  };
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render([
      createElement(Motion, { key: 'm' }),
      createElement(Density, { key: 'd' }),
      createElement(Accent, { key: 'a' }),
    ]);
  });
}

beforeEach(() => {
  Object.assign(renders, { motion: 0, density: 0, accent: 0 });
  Object.assign(writes, { themes: 0, variables: 0 });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme settings subscriptions', () => {
  it('wakes only the readers of the changed setting across 500 appearance changes', async () => {
    const theme = await load();
    mountReaders(theme);
    const base = CLIENT_PREFS.appearance.defaultValue;
    const accents = ['amber', 'aqua'] as const;
    for (let step = 1; step <= 500; step += 1) {
      act(() => {
        theme.applyTheme({ ...base, accent: accents[step % 2] ?? 'amber' });
      });
    }
    expect(renders.motion).toBe(1);
    expect(renders.density).toBe(1);
    expect(renders.accent).toBeGreaterThan(1);
  });

  it('ignores an equal settings object so a layouts notice rewrites nothing', async () => {
    const theme = await load();
    mountReaders(theme);
    const base = CLIENT_PREFS.appearance.defaultValue;
    act(() => {
      theme.applyTheme({ ...base, density: 'compact' });
    });
    const written = { ...writes };
    for (let step = 0; step < 500; step += 1) {
      act(() => {
        theme.applyTheme({ ...base, density: 'compact' });
      });
    }
    expect(writes).toEqual(written);
    expect(renders.density).toBe(2);
    expect(renders.motion).toBe(1);
  });
});
