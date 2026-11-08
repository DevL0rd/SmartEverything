import { randomUUID } from 'node:crypto';
import { AI_CHAT_ROW } from '@smarteverything/domain';
import { act, createElement, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserAction } from '../browser/browser-actions';
import { BrowserTabs } from '../browser/browser-tabs';
import { HarnessBrowser } from './harness-browser';

const { focusAddress, openMenu, notify, route, setParams } = vi.hoisted(() => {
  const route: { browserAction: string | undefined } = { browserAction: undefined };
  return {
    focusAddress: vi.fn<() => void>(),
    openMenu: vi.fn<() => void>(),
    notify: vi.fn(),
    route,
    setParams: vi.fn(({ browserAction }: Readonly<typeof route>): void => {
      route.browserAction = browserAction;
    }),
  };
});

vi.mock('expo-router', () => ({
  router: { setParams },
  useIsFocused: (): boolean => true,
  useLocalSearchParams: (): Readonly<typeof route> => route,
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => randomUUID() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  ScrollView: ({ children }: { readonly children: ReactNode }): ReactNode => children,
  TextInput: ({ ref }: { readonly ref: Ref<{ readonly focus: () => void }> }): null => {
    useImperativeHandle(ref, () => ({ focus: focusAddress }), []);
    return null;
  },
}));
vi.mock('../../../store/people', () => ({
  useActiveProfile: (): { readonly id: string } => ({ id: CHAT.profile_id }),
}));
vi.mock('../../../components/toast-store', () => ({ notify }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/copy-button', () => ({ copyText: vi.fn() }));
vi.mock('../../../components/menu', () => ({
  useAnchoredMenu: (): { readonly ref: null; readonly open: () => void; readonly menu: null } => ({
    ref: null,
    open: openMenu,
    menu: null,
  }),
}));
vi.mock('../../../platform/browser-surface', () => ({
  browserCapability: (): { readonly limitation: null; readonly publicBrowsing: boolean } => ({
    limitation: null,
    publicBrowsing: true,
  }),
}));
vi.mock('../../../platform/browser-html-projection', () => ({
  projectPageTarget: vi.fn(),
  releaseProjectTarget: vi.fn(),
}));
vi.mock('../browser/browser-tab-strip', () => ({ BrowserTabStrip: (): null => null }));
vi.mock('../browser/browser-console', () => ({ BrowserConsole: (): null => null }));
vi.mock('../browser/browser-surface-slot', () => ({ BrowserSurfaceSlot: (): null => null }));

const CHAT_ID = '00000000-0000-4000-8000-000000000001';
const PROFILE_ID = '00000000-0000-4000-8000-000000000002';
const AT = '2026-10-17T10:00:00.000Z';
const CHAT = AI_CHAT_ROW.parse({
  id: CHAT_ID,
  profile_id: PROFILE_ID,
  kind: 'chat',
  title: 'Browser preview',
  icon: null,
  parent_id: null,
  source_key: null,
  engine: { kind: 'codex', device_id: '00000000-0000-4000-8000-000000000003', model: 'model' },
  tools: null,
  pinned: false,
  memory: true,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: AT,
  updated_at: AT,
});

let root: Root;
let tabs: BrowserTabs;

function render(action: BrowserAction, visible = true): void {
  route.browserAction = action;
  act(() => {
    root.render(createElement(HarnessBrowser, { chat: CHAT, tabs, visible }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
  tabs = new BrowserTabs(CHAT_ID, PROFILE_ID);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('browser action links with no open tabs', () => {
  it.each(['reload', 'copy', 'close-tab', 'tab-earlier', 'tab-later'] as const)(
    'consumes %s and tells the person to open a tab',
    (action) => {
      render(action);
      expect(setParams).toHaveBeenCalledExactlyOnceWith({ browserAction: undefined });
      expect(notify).toHaveBeenCalledExactlyOnceWith({
        message: 'Open a browser tab first.',
        tone: 'default',
      });
      expect(tabs.read().tabs).toHaveLength(0);
    },
  );

  it('keeps a later tab open and still honors a fresh close request', () => {
    render('close-tab');
    act(() => {
      tabs.blank();
    });
    expect(tabs.read().tabs).toHaveLength(1);
    render('close-tab');
    expect(tabs.read().tabs).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('handles an empty browser action when the pane becomes visible', () => {
    render('reload', false);
    expect(setParams).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    render('reload');
    expect(setParams).toHaveBeenCalledExactlyOnceWith({ browserAction: undefined });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('still opens an empty browser tab', () => {
    render('new-tab');
    expect(tabs.read().tabs).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('still focuses the address and opens the options menu', () => {
    render('address');
    expect(focusAddress).toHaveBeenCalledTimes(1);
    render('menu');
    expect(openMenu).toHaveBeenCalledTimes(1);
    expect(tabs.read().tabs).toHaveLength(0);
  });
});
