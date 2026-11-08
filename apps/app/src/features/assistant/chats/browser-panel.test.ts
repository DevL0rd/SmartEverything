import { AI_CHAT_ROW } from '@smarteverything/domain';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BrowserTabs } from '../browser/browser-tabs';
import { BrowserPane } from './browser-panel';
import type { PanelState } from './chat-panel-state';

const { route, container, preview, detached } = vi.hoisted(() => ({
  route: { focused: true },
  container:
    vi.fn<(props: { readonly inert?: boolean; readonly 'aria-hidden'?: boolean }) => void>(),
  preview: vi.fn<(visible: boolean, tabs: BrowserTabs) => void>(),
  detached: vi.fn<() => void>(),
}));

vi.mock('expo-router', () => ({ useIsFocused: (): boolean => route.focused }));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => CHAT.id }));
vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('react-native-reanimated', () => ({
  default: {
    View: (props: {
      readonly children: ReactNode;
      readonly 'aria-hidden'?: boolean;
    }): ReactNode => {
      if (props['aria-hidden'] !== undefined) container(props);
      return props.children;
    },
  },
  useSharedValue: (): { readonly get: () => number; readonly set: () => void } => ({
    get: () => 1,
    set: vi.fn(),
  }),
  useAnimatedStyle: vi.fn(),
}));
vi.mock('../../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: true }),
}));
vi.mock('./list-pane', () => ({ PANEL_SLIDE: null }));
vi.mock('../../../platform/browser-surface', () => ({ browserCapability: vi.fn() }));
vi.mock('../../../platform/browser-html-projection', () => ({ releaseProjectTarget: vi.fn() }));
vi.mock('../provider/harness-browser', () => ({
  HarnessBrowser: ({
    visible,
    tabs,
  }: {
    readonly visible: boolean;
    readonly tabs: BrowserTabs;
  }): null => {
    useEffect(() => detached, []);
    preview(visible, tabs);
    return null;
  },
}));

const AT = '2026-10-17T10:00:00.000Z';
const CHAT = AI_CHAT_ROW.parse({
  id: '00000000-0000-4000-8000-000000000001',
  profile_id: '00000000-0000-4000-8000-000000000002',
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

function panel(open: boolean): PanelState {
  return {
    docked: open,
    open,
    toggle: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    measure: vi.fn(),
  };
}

it('makes Browser controls inert while closed or unfocused and keeps their mounted workspace', () => {
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
  const tabs = new BrowserTabs(CHAT.id, CHAT.profile_id);
  try {
    for (const [open, focused, active, shown] of [
      [true, true, true, true],
      [false, true, true, false],
      [true, true, true, true],
      [true, false, true, false],
      [true, true, false, false],
      [true, true, true, true],
    ] as const) {
      route.focused = focused;
      act(() => {
        root.render(
          createElement(BrowserPane, { active, chat: CHAT, panel: panel(open), browser: { tabs } }),
        );
      });
      expect(container.mock.lastCall?.[0]).toMatchObject({ inert: !shown, 'aria-hidden': !shown });
      expect(preview.mock.lastCall).toEqual([shown, tabs]);
      expect(detached).not.toHaveBeenCalled();
    }
  } finally {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  }
});
