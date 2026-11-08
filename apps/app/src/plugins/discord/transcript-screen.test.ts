import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const controls = vi.hoisted(() => ({
  pick: vi.fn<(id: string) => void>(),
  selector: vi.fn<(id: string, focus: boolean) => void>(),
  search: vi.fn<(focus: boolean) => void>(),
  reader: vi.fn<(id: string) => void>(),
}));

const calls = ['first', 'second'].map((id) => ({
  id,
  title: id,
  started_at: '2026-01-01T00:00:00Z',
  ended_at: null,
  line_count: 1,
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('expo-router', () => ({
  useIsFocused: (): boolean => true,
  useLocalSearchParams: (): { readonly focus: string } => ({ focus: 'transcript-search' }),
}));
vi.mock('../shared/plugin-log', () => ({ usePluginScreen: vi.fn() }));
vi.mock('./discord-data', () => ({ DISCORD_PLUGIN: 'discord' }));
vi.mock('../../app-shell/hrefs', () => ({
  href: {
    settings: { page: (id: string): string => `/settings/${id}` },
    pluginSettings: (id: string): string => `/settings/plugins/${id}`,
  },
}));
vi.mock('../../components/banner', () => ({ Banner: (): null => null }));
vi.mock('../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock('../../components/screen', () => ({ Screen: childrenOf }));
vi.mock('../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../components/select', () => ({
  Select: ({
    value,
    focusOnMount,
    onChange,
  }: {
    readonly value: string;
    readonly focusOnMount: boolean;
    readonly onChange: (id: string) => void;
  }): null => {
    controls.pick.mockImplementation(onChange);
    controls.selector(value, focusOnMount);
    return null;
  },
}));
vi.mock('../../components/transcript-feed', () => ({
  TranscriptFeed: ({
    header,
    focusSearch,
  }: {
    readonly header: ReactNode;
    readonly focusSearch: boolean;
  }): ReactNode => {
    controls.search(focusSearch);
    return header;
  },
}));
vi.mock('../../queries/transcript-reader/use-feed-controller', () => ({
  useFeedController: ({ sessionId }: { readonly sessionId: string }): undefined => {
    controls.reader(sessionId);
    return undefined;
  },
}));
vi.mock('../../queries/transcript-reader/use-transcript-removal', () => ({
  useTranscriptRemoval: (): undefined => undefined,
}));
vi.mock('../../queries/transcript-reader/use-transcript-sessions', () => ({
  useTranscriptSessions: (): { readonly data: typeof calls } => ({ data: calls }),
}));
vi.mock('../../store/selectors', () => ({
  useSettings: (): { readonly time_zone: string } => ({ time_zone: 'UTC' }),
}));

const { DiscordTranscriptScreen } = await import('./transcript-screen');

describe('Discord transcript call selection', () => {
  it('hands focus from the deep-linked search to the selector after choosing a call', () => {
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
    try {
      act(() => {
        root.render(createElement(DiscordTranscriptScreen, { pluginId: 'discord' }));
      });
      expect(controls.reader).toHaveBeenLastCalledWith('first');
      expect(controls.selector).toHaveBeenLastCalledWith('first', false);
      expect(controls.search).toHaveBeenLastCalledWith(true);

      act(() => {
        controls.pick('second');
      });
      expect(controls.reader).toHaveBeenLastCalledWith('second');
      expect(controls.selector).toHaveBeenLastCalledWith('second', true);
      expect(controls.search).toHaveBeenLastCalledWith(false);
    } finally {
      act(() => {
        root.unmount();
      });
      vi.unstubAllGlobals();
    }
  });
});
