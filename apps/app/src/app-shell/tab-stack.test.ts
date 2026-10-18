import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabGroup } from './tab-group';

const seen: (string | null)[] = [];
const boosted: string[] = [];
let focused = true;

vi.mock('expo-router', () => ({
  useIsFocused: (): boolean => focused,
  useRoute: (): { readonly key: string; readonly name: string } => ({
    key: 'devices-key',
    name: '(devices)',
  }),
  Stack: function StackProbe(): ReactNode {
    seen.push(useTabGroup());
    return null;
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../design/colour', () => ({ useColour: (): string => '#000000' }));
vi.mock('./instant-open', () => ({
  forgetRoute: (): void => undefined,
  isInstantRoute: (): boolean => false,
}));
vi.mock('./nav-model', () => ({
  tabOfRouteName: (name: string): string | null => (name === '(devices)' ? 'devices' : null),
}));
vi.mock('./screen-pause', () => ({ screenPause: (): null => null }));
vi.mock('./preloader', () => ({
  preloader: {
    boostSection: (tab: string): void => {
      boosted.push(tab);
    },
  },
}));

const { TabStack } = await import('./tab-stack');

let root: Root;

function render(): void {
  act(() => {
    root.render(createElement(TabStack));
  });
}

beforeEach(() => {
  seen.length = 0;
  boosted.length = 0;
  focused = true;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('tab stack', () => {
  it('tells its screens which tab they live in, from its own route', () => {
    render();
    expect(seen).toEqual(['(devices)']);
  });

  it('boosts its own section when it gains focus and not again for an unchanged focus', () => {
    render();
    render();
    expect(boosted).toEqual(['devices']);
  });

  it('does not boost while another tab is shown', () => {
    focused = false;
    render();
    expect(boosted).toEqual([]);
  });
});
