import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from '../../../../design/screen-pause';
import { IDLE_CALL, type CallView } from '../call-state';

const counts = vi.hoisted(() => ({ footnote: 0 }));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: unknown }): unknown => children,
  AppState: {
    currentState: 'active',
    addEventListener: (): { readonly remove: () => void } => ({ remove: (): void => undefined }),
  },
}));

vi.mock('../../../../components/text', () => ({
  Text: ({ variant }: { readonly variant?: string }): null => {
    if (variant === 'footnote') counts.footnote += 1;
    return null;
  },
}));

const { CallStatus } = await import('./call-status');

const LIVE: CallView = { ...IDLE_CALL, phase: 'listening', startedAt: Date.now() };

function tick(seconds: number): void {
  for (let index = 0; index < seconds; index += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

function mount(pause: ScreenPause): Root {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(
      createElement(
        ScreenPausedContext,
        { value: pause },
        createElement(CallStatus, { call: LIVE, name: 'Assistant' }),
      ),
    );
  });
  return root;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  counts.footnote = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the call status clock', () => {
  it('re-renders once a second while the call screen is live', () => {
    const root = mount(new ScreenPause(null));
    const mounted = counts.footnote;
    tick(5);
    expect(counts.footnote - mounted).toBe(5);
    act(() => {
      root.unmount();
    });
  });

  it('does not re-render while the call screen is paused', () => {
    const root = mount(new ScreenPause(null, true));
    const mounted = counts.footnote;
    tick(10);
    expect(counts.footnote - mounted).toBe(0);
    act(() => {
      root.unmount();
    });
  });
});
