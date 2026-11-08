import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const sync = vi.hoisted(() => ({ status: 'live' }));

interface FrameProps {
  readonly banner?: ReactElement;
  readonly search?: boolean;
  readonly children?: ReactNode;
}

interface BannerProps {
  readonly title: string;
  readonly body: string;
}

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, children),
  ScrollView: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, children),
}));
vi.mock('expo-router', () => ({ useLocalSearchParams: (): object => ({}) }));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title, body }: BannerProps): ReactNode =>
    createElement('aside', null, `${title} | ${body}`),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode => createElement('p', null, title),
}));
vi.mock('../../../components/use-focus-on-mount', () => ({ useFocusOnMount: vi.fn() }));
vi.mock('../../../design/visibility', () => ({ useScopeVisible: (): boolean => true }));
vi.mock('../../../store/selectors', () => ({ useSyncStatus: (): object => sync }));
vi.mock('../components/photos-frame', () => ({
  PhotosFrame: ({ banner, children, search }: FrameProps): ReactNode =>
    createElement('main', { 'data-global-search': search }, banner ?? null, children),
}));
vi.mock('./recent', () => ({
  usePhotoRecentSearches: (): object => ({ recent: [], note: vi.fn(), remove: vi.fn() }),
}));
vi.mock('./use-search-sources', () => ({
  useSearchSources: (): object => ({
    countries: [],
    albums: [],
    cameras: [],
    photos: null,
    videos: null,
    favourites: null,
    dates: { today: '2026-11-07', southern: false, months: new Map() },
  }),
}));
vi.mock('./start', () => ({ SearchStart: (): ReactNode => null }));
vi.mock('./suggestions', () => ({ Suggestions: (): ReactNode => null }));
vi.mock('./token-field', () => ({ TokenField: (): ReactNode => null }));
vi.mock('./results-view', () => ({ SearchResults: (): ReactNode => null }));
vi.mock('./use-search-pages', () => ({
  useSearchPages: (): object => ({ tiles: [], ids: [], state: 'loading' }),
}));
vi.mock('../../../components/media-grid/selection', () => ({
  useMediaSelection: (): object => ({ selection: { active: false }, clear: vi.fn() }),
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => 1200 }));
vi.mock('../../nas/frame/sections', () => ({ libraryLayoutOf: (): string => 'wide' }));
vi.mock('../timeline/use-media-actions', () => ({ useMediaActions: (): object => ({}) }));
vi.mock('../timeline/timeline-selection', () => ({
  TimelineActionRow: (): ReactNode => null,
  TimelineSelection: (): ReactNode => null,
  TimelineSelectionHead: (): ReactNode => null,
}));

const { PhotosSearchScreen } = await import('./search-screen');

function render(): string {
  return renderToStaticMarkup(createElement(PhotosSearchScreen));
}

describe('PhotosSearchScreen', () => {
  it('uses its photo search field without adding the global search button', () => {
    expect(render()).toContain('data-global-search="false"');
  });

  it('shows no banner while the hub is live', () => {
    sync.status = 'live';
    expect(render()).not.toContain('<aside>');
  });

  it('tells the person that new searches need the hub while offline', () => {
    sync.status = 'offline';
    expect(render()).toContain(
      'Offline · showing earlier results | New searches need your home hub.',
    );
  });

  it('opens on the empty start when there is nothing to try or recall', () => {
    sync.status = 'live';
    expect(render()).toContain('Search your photos');
  });
});
