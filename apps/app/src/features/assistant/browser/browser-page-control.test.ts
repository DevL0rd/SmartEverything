import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_PAGE_NOTICE,
  type BrowserPageReading,
  type NativeBrowserPageRequest,
} from '@smarteverything/domain';

const native = vi.hoisted(
  (): {
    page:
      | { perform: (request: NativeBrowserPageRequest) => Promise<BrowserPageReading | null> }
      | undefined;
    requests: NativeBrowserPageRequest[];
    answer: BrowserPageReading | null;
  } => ({ page: undefined, requests: [], answer: null }),
);

vi.mock('./browser-diagnostics-platform', () => ({
  previewDiagnosticsNative: (): { page?: typeof native.page } =>
    native.page === undefined ? {} : { page: native.page },
}));

const { browserPageSupported, performBrowserPageAction, readBrowserPage } =
  await import('./browser-page-control');
const { BROWSER_TAB_ID } = await import('./browser-tab-state');

const TAB_ID = BROWSER_TAB_ID.parse('00000000-0000-4000-8000-000000000010');

const READING: BrowserPageReading = {
  generation: 4,
  end: 6,
  title: 'Shop',
  text: 'Welcome',
  textTruncated: false,
  elements: [
    { ref: 'e4', role: 'link', name: 'Cart', value: null, checked: null, disabled: false },
  ],
  elementsTruncated: false,
};

function tab(phase: 'ready' | 'opening' = 'ready'): Parameters<typeof readBrowserPage>[0] {
  const base = {
    id: TAB_ID,
    title: 'Shop',
    address: 'https://shop.example.com/',
    editing: false,
    status: {
      id: 'public:1',
      url: 'https://shop.example.com/cart',
      loading: false,
      back: false,
      forward: false,
      problem: null,
    },
    source: { kind: 'public' as const, url: 'https://shop.example.com/' },
    problem: null,
  };
  return phase === 'ready'
    ? {
        ...base,
        phase,
        selection: {
          kind: 'public',
          target: { kind: 'public', id: 'public:1', url: 'https://shop.example.com/' },
        },
      }
    : { ...base, phase, selection: null };
}

beforeEach(() => {
  native.requests.length = 0;
  native.answer = READING;
  native.page = {
    perform: (request): Promise<BrowserPageReading | null> => {
      native.requests.push(request);
      return Promise.resolve(request.operation.kind === 'snapshot' ? native.answer : null);
    },
  };
});

describe('reading a browser page', () => {
  it('labels the text as data and carries the tab and its address', async () => {
    const page = await readBrowserPage(tab(), TAB_ID);
    expect(page).toEqual({
      notice: BROWSER_PAGE_NOTICE,
      tabId: TAB_ID,
      address: 'https://shop.example.com/cart',
      generation: 4,
      title: 'Shop',
      text: 'Welcome',
      textTruncated: false,
      elements: READING.elements,
      elementsTruncated: false,
    });
    expect(native.requests).toEqual([{ id: 'public:1', operation: { kind: 'snapshot' } }]);
  });

  it('asks to wait for a tab that has no page yet', async () => {
    await expect(readBrowserPage(tab('opening'), TAB_ID)).rejects.toThrow('no page open yet');
  });

  it('asks to select a tab that is not the one showing', async () => {
    await expect(readBrowserPage(tab(), null)).rejects.toThrow('Select this tab first');
  });

  it('says so when this device cannot read pages', async () => {
    native.page = undefined;
    expect(browserPageSupported()).toBe(false);
    await expect(readBrowserPage(tab(), TAB_ID)).rejects.toThrow('cannot read or act');
  });

  it('fails when the page answers nothing', async () => {
    native.answer = null;
    await expect(readBrowserPage(tab(), TAB_ID)).rejects.toThrow('did not answer');
  });
});

describe('acting on a browser page', () => {
  const tabs = (selected: typeof TAB_ID | null): Parameters<typeof performBrowserPageAction>[0] => {
    return {
      tab: () => tab(),
      read: () => ({ tabs: [], selectedId: selected, problem: null }),
      handle: () => ({
        navigate: () => undefined,
        back: (): void => undefined,
        forward: (): void => undefined,
        reload: () => undefined,
        stop: () => undefined,
      }),
    };
  };

  it('is supported where the device offers page access', () => {
    expect(browserPageSupported()).toBe(true);
  });

  it('sends a click, a typed value, keys and a scroll without the tab id', async () => {
    const control = tabs(TAB_ID);
    await performBrowserPageAction(control, { kind: 'click', tabId: TAB_ID, ref: 'e4' });
    await performBrowserPageAction(control, {
      kind: 'type',
      tabId: TAB_ID,
      ref: 'e4',
      text: 'shoes',
      submit: true,
    });
    await performBrowserPageAction(control, { kind: 'keys', tabId: TAB_ID, keys: 'ctrl+f' });
    await performBrowserPageAction(control, { kind: 'scroll', tabId: TAB_ID, dx: 0, dy: 200 });
    expect(native.requests.map((request) => request.operation)).toEqual([
      { kind: 'click', ref: 'e4' },
      { kind: 'type', ref: 'e4', text: 'shoes', submit: true },
      { kind: 'keys', keys: 'ctrl+f' },
      { kind: 'scroll', dx: 0, dy: 200 },
    ]);
  });

  it('refuses to act on a tab that is not showing', async () => {
    await expect(
      performBrowserPageAction(tabs(null), { kind: 'click', tabId: TAB_ID, ref: 'e4' }),
    ).rejects.toThrow('Select this tab first');
    expect(native.requests).toEqual([]);
  });

  it('goes back and forward through the tab history', async () => {
    const calls: string[] = [];
    const control: Parameters<typeof performBrowserPageAction>[0] = {
      ...tabs(TAB_ID),
      handle: () => ({
        navigate: () => undefined,
        back: (): void => {
          calls.push('back');
        },
        forward: (): void => {
          calls.push('forward');
        },
        reload: () => undefined,
        stop: () => undefined,
      }),
    };
    await performBrowserPageAction(control, { kind: 'back', tabId: TAB_ID });
    await performBrowserPageAction(control, { kind: 'forward', tabId: TAB_ID });
    expect(calls).toEqual(['back', 'forward']);
    expect(native.requests).toEqual([]);
  });
});
