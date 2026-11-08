import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePanelState, type PanelState } from './chat-panel-state';

vi.mock('expo-router', () => ({
  useIsFocused: (): boolean => true,
  useLocalSearchParams: (): Record<string, never> => ({}),
}));
vi.mock('react-native', () => ({
  Dimensions: { addEventListener: vi.fn() },
  Platform: { OS: 'web' },
}));
vi.mock('../../../store/local-prefs', () => ({
  useLocalPref: (): boolean => true,
}));

it('keeps an open browser beside the chat at desktop widths and uses the entire phone thread', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const capture = vi.fn<(panel: PanelState) => void>();
  function Thread(): null {
    capture(usePanelState());
    return null;
  }
  try {
    act(() => {
      root.render(createElement(Thread));
    });
    for (const [width, docked] of [
      [412, false],
      [700, false],
      [876, true],
      [2876, true],
      [412, false],
    ] as const) {
      const panel = capture.mock.lastCall?.[0];
      expect(panel).toBeDefined();
      act(() => {
        panel?.measure(width);
      });
      expect(capture.mock.lastCall?.[0]).toMatchObject({ open: true, docked });
    }
  } finally {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});
