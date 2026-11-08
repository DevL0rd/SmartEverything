import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserInert, rememberBrowserFocus, restoreBrowserFocus } from './browser-focus';

const platform = vi.hoisted(() => ({ OS: 'web' }));
vi.mock('react-native', () => ({ Platform: platform }));

class ElementFixture {
  readonly focus = vi.fn();
  isConnected = true;
  hidden = false;
  laidOut = true;
  getClientRects(): readonly number[] {
    return this.laidOut ? [1] : [];
  }
  closest(selector: string): ElementFixture | null {
    return this.hidden && selector.includes('[inert]') ? this : null;
  }
}

let frame: FrameRequestCallback | null;
const documentFixture = { activeElement: new ElementFixture(), body: new ElementFixture() };

beforeEach(() => {
  platform.OS = 'web';
  frame = null;
  documentFixture.activeElement = documentFixture.body;
  vi.stubGlobal('HTMLElement', ElementFixture);
  vi.stubGlobal('document', documentFixture);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    frame = callback;
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Browser keyboard focus', () => {
  it('makes hidden browser controls inert on web without sending a web prop to native', () => {
    expect(browserInert(true)).toEqual({ inert: true });
    expect(browserInert(false)).toEqual({ inert: false });
    platform.OS = 'android';
    expect(browserInert(true)).toEqual({});
  });

  it('restores the visible opener after the panel is committed closed', () => {
    const opener = new ElementFixture();
    const toggle = new ElementFixture();
    documentFixture.activeElement = opener;
    rememberBrowserFocus('pane');
    restoreBrowserFocus('pane', () => toggle);
    expect(opener.focus).not.toHaveBeenCalled();
    frame?.(0);
    expect(opener.focus).toHaveBeenCalledExactlyOnceWith();
    expect(toggle.focus).not.toHaveBeenCalled();
  });

  it.each(['unmounted opener', 'inert opener', 'hidden route', 'no opener'] as const)(
    'returns focus to the chat header toggle with %s',
    (caseName) => {
      const opener = new ElementFixture();
      const toggle = new ElementFixture();
      if (caseName !== 'no opener') documentFixture.activeElement = opener;
      rememberBrowserFocus('pane');
      restoreBrowserFocus('pane', () => toggle);
      opener.isConnected = caseName !== 'unmounted opener';
      opener.hidden = caseName === 'inert opener';
      opener.laidOut = caseName !== 'hidden route';
      frame?.(0);
      expect(opener.focus).not.toHaveBeenCalled();
      expect(toggle.focus).toHaveBeenCalledExactlyOnceWith();
    },
  );
});
