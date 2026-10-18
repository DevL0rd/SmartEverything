import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface KeyboardListeners {
  show: ((event: unknown) => void) | null;
  hide: (() => void) | null;
}

const keyboard = vi.hoisted((): KeyboardListeners => ({ show: null, hide: null }));

vi.mock('react-native', () => ({
  Keyboard: {
    addListener: (name: string, listener: () => void): { remove: () => undefined } => {
      if (name === 'keyboardDidShow') keyboard.show = listener;
      else keyboard.hide = listener;
      return { remove: (): undefined => undefined };
    },
  },
}));

const renders = { host: 0 };
const HOST = { x: 0, y: 0, width: 400, height: 800 };

function shown(y: number): unknown {
  return { endCoordinates: { screenX: 0, screenY: y, width: 400, height: 800 - y } };
}

beforeEach(() => {
  renders.host = 0;
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

describe('toast room', () => {
  it('re-renders the toast host only when the room changes, not on equal obstacle updates', async () => {
    vi.resetModules();
    const obstacles = await import('./toast-obstacles');
    const Host = (): ReactNode => {
      renders.host += 1;
      obstacles.useKeyboardObstacle();
      obstacles.useToastRoom(HOST);
      return null;
    };
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      root.render(createElement(Host));
    });
    const mounted = renders.host;
    act(() => {
      keyboard.show?.(shown(500));
    });
    const opened = renders.host;
    expect(opened).toBe(mounted + 1);
    for (let step = 0; step < 500; step += 1) {
      act(() => {
        keyboard.show?.(shown(500));
      });
    }
    expect(renders.host).toBe(opened);
    act(() => {
      keyboard.hide?.();
    });
    expect(renders.host).toBe(opened + 1);
  });
});
