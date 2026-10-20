import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveWatch } from '../../../store/live-watch';
import { PHONE_LIVE_TOPICS, usePhoneLiveHeld } from './phone-live';

const PHONE = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const roots: ReturnType<typeof createRoot>[] = [];

function watching(deviceId: string): { readonly seen: boolean[] } {
  const seen: boolean[] = [];
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  roots.push(root);
  act(() => {
    root.render(
      createElement((): null => {
        seen.push(usePhoneLiveHeld(deviceId));
        return null;
      }),
    );
  });
  return { seen };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  vi.unstubAllGlobals();
});

describe('usePhoneLiveHeld', () => {
  it('follows whether a page holds the live lease of this phone', () => {
    const { seen } = watching(PHONE);
    expect(seen.at(-1)).toBe(false);
    let release = (): void => undefined;
    act(() => {
      release = liveWatch.hold(PHONE, PHONE_LIVE_TOPICS);
    });
    expect(seen.at(-1)).toBe(true);
    act(release);
    expect(seen.at(-1)).toBe(false);
  });

  it('ignores the lease of another phone', () => {
    const { seen } = watching(PHONE);
    let release = (): void => undefined;
    act(() => {
      release = liveWatch.hold(OTHER, PHONE_LIVE_TOPICS);
    });
    expect(seen.at(-1)).toBe(false);
    act(release);
  });

  it('renders on the server without a lease held', () => {
    const html = renderToStaticMarkup(
      createElement(() => createElement('span', null, String(usePhoneLiveHeld(PHONE)))),
    );
    expect(html).toContain('false');
  });
});
