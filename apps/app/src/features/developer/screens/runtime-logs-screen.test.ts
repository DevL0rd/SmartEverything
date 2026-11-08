import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ButtonProps } from '../../../components/button';
import type { ErrorStateProps } from '../../../components/error-state';
import { RuntimeLogsScreen } from './runtime-logs-screen';

const { list, button, retry, fetchNextPage, state } = vi.hoisted(() => ({
  list: vi.fn<(props: { readonly onEndReached?: () => void }) => void>(),
  button: vi.fn<(props: ButtonProps) => void>(),
  retry: vi.fn<(props: ErrorStateProps) => void>(),
  fetchNextPage: vi
    .fn<(options: { readonly cancelRefetch: boolean }) => Promise<undefined>>()
    .mockResolvedValue(undefined),
  state: { hasNextPage: true, isFetching: false, isFetchNextPageError: false },
}));

vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('expo-router', () => ({ Redirect: (): null => null }));
vi.mock('@shopify/flash-list', () => ({
  FlashList: (props: {
    readonly ListFooterComponent: ReactNode;
    readonly onEndReached?: () => void;
  }): ReactNode => {
    list(props);
    return props.ListFooterComponent;
  },
}));
vi.mock('../../../app-shell/hrefs', () => ({ href: {} }));
vi.mock('../../../components/button', () => ({
  Button: (props: ButtonProps): null => {
    button(props);
    return null;
  },
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: (props: ErrorStateProps): null => {
    retry(props);
    return null;
  },
}));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/search-field', () => ({ SearchField: (): null => null }));
vi.mock('../../../components/select', () => ({ Select: (): null => null }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../design/use-debounced-value', () => ({
  useDebouncedValue: (value: string): string => value,
}));
vi.mock('../../../developer/panel-read', () => ({ useDeveloperOn: (): boolean => true }));
vi.mock('../../../settings/settings-frame', () => ({
  SettingsFrame: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => true,
  useSession: (): { readonly client: { readonly id: string } } => ({ client: { id: 'owner' } }),
}));
vi.mock('../components/runtime-log-row', () => ({ RuntimeLogEntry: (): null => null }));
vi.mock('../data/runtime-logs', () => ({
  useRuntimeLogs: (): unknown => ({
    ...state,
    isFetchingNextPage: state.isFetching,
    data: { pages: [{ rows: [] }] },
    error: new Error('Could not load older logs'),
    fetchNextPage,
  }),
  useRuntimeLogSources: (): unknown => ({ data: { sources: [] } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { hasNextPage: true, isFetching: false, isFetchNextPageError: false });
});

function render(): void {
  renderToStaticMarkup(createElement(RuntimeLogsScreen));
}

it('loads older logs only through the explicit action', () => {
  render();
  expect(list.mock.lastCall?.[0].onEndReached).toBeUndefined();
  expect(fetchNextPage).not.toHaveBeenCalled();
  const action = button.mock.lastCall?.[0];
  expect(action?.label).toBe('Load older logs');
  action?.onPress?.();
  expect(fetchNextPage).toHaveBeenCalledOnce();
  expect(fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
});

it('removes the older action on the last page and keeps a retry on failure', () => {
  state.hasNextPage = false;
  render();
  expect(button).not.toHaveBeenCalled();

  state.hasNextPage = true;
  state.isFetchNextPageError = true;
  render();
  retry.mock.lastCall?.[0].retry?.();
  expect(fetchNextPage).toHaveBeenCalledOnce();
});
