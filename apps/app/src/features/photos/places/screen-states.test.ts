import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type PhotoPlace, type PlaceCountry } from '@smarteverything/domain';
import { MAP_COPY } from './map-copy';
import { MapScreen } from './map-screen';
import { itemsLabel, PlaceScreen } from './place-screen';

interface QueryState<T> {
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly isError: boolean;
  readonly refetch: () => Promise<unknown>;
}

function query<T>(data: T | undefined, error: Error | null = null): QueryState<T> {
  return { data, error, isError: error !== null, refetch: () => Promise.resolve() };
}

const state = vi.hoisted(
  (): {
    places: QueryState<readonly PlaceCountry[]>;
    place: QueryState<PhotoPlace>;
    placeId: string;
    sync: string;
  } => ({
    places: { data: undefined, error: null, isError: false, refetch: () => Promise.resolve() },
    place: { data: undefined, error: null, isError: false, refetch: () => Promise.resolve() },
    placeId: '1',
    sync: 'live',
  }),
);

vi.mock('../components/photos-frame', () => ({
  PhotosFrame: ({
    children,
    title,
    settings,
    search,
  }: {
    readonly children: ReactNode;
    readonly title?: string;
    readonly settings?: { readonly label: string };
    readonly search?: { readonly placeholder: string };
  }): ReactNode =>
    createElement(
      'main',
      {
        'data-title': title ?? '',
        'data-settings': settings?.label ?? '',
        'data-search': search?.placeholder ?? '',
      },
      children,
    ),
}));
vi.mock('../data', () => ({
  PHOTO_ALL: { filter: 'all' },
  usePhotoPlaces: (): QueryState<readonly PlaceCountry[]> => state.places,
  usePhotoPlace: (): QueryState<PhotoPlace> => state.place,
  usePhotoBuckets: (): QueryState<readonly never[]> => query<readonly never[]>(undefined),
  usePhotoClusters: (): QueryState<readonly never[]> => query<readonly never[]>([]),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: (): Readonly<Record<string, string>> => ({ placeId: state.placeId }),
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: state.sync }),
}));
vi.mock(import('../../../design/size-class'), async (original) => ({
  ...(await original()),
  useAreaWidth: (): number => 1360,
}));
vi.mock('../../../components/segmented', () => ({ Segmented: (): null => null }));
vi.mock('../../../components/skeleton', () => ({
  Skeleton: (): ReactNode => createElement('i', { 'data-skeleton': '1' }),
}));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title }: { readonly title: string }): ReactNode => createElement('aside', {}, title),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('a', {}, label),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({
    title,
    body,
    action,
  }: {
    readonly title: string;
    readonly body: string;
    readonly action?: ReactNode;
  }): ReactNode => createElement('section', {}, title, ' ', body, action),
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: ({ error }: { readonly error: Error }): ReactNode =>
    createElement('p', { role: 'alert' }, error.message),
}));
vi.mock('./cluster-map', () => ({ ClusterMap: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/charts/progress-bar', () => ({ ProgressBar: (): null => null }));
vi.mock('./cover', () => ({ Cover: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({
    label,
    children,
  }: {
    readonly label: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('a', { 'aria-label': label }, children),
}));
vi.mock('../world-map', () => ({ MiniMap: (): null => null, NATURAL_EARTH_ATTRIBUTION: '' }));

const LISBON: PhotoPlace = {
  id: 1,
  name: 'Lisbon',
  admin: null,
  country: 'Portugal',
  countryCode: 'PT',
  lat: 38.7,
  lon: -9.1,
  count: 842,
  coverItemId: null,
};

function map(): string {
  return renderToStaticMarkup(createElement(MapScreen));
}

function placePage(): string {
  return renderToStaticMarkup(createElement(PlaceScreen));
}

describe('map and places states', () => {
  it('shows the placeholder while places load', () => {
    state.places = query<readonly PlaceCountry[]>(undefined);
    expect(map()).toContain('data-skeleton');
  });

  it('shows the error while the hub is live and the offline note when it is not', () => {
    state.places = query<readonly PlaceCountry[]>(undefined, new Error('Places failed'));
    expect(map()).toContain('role="alert"');
    state.sync = 'interrupted';
    const markup = map();
    expect(markup).toContain(MAP_COPY.unreachable.body);
    expect(markup).not.toContain('role="alert"');
    state.sync = 'live';
  });

  it('explains an empty map and keeps it without a page banner when the hub goes offline', () => {
    state.places = query<readonly PlaceCountry[]>([]);
    expect(map()).toContain(MAP_COPY.empty.title);
    state.sync = 'interrupted';
    const markup = map();
    expect(markup).toContain(MAP_COPY.empty.title);
    expect(markup).not.toContain('Offline');
    state.sync = 'live';
  });
});

describe('map with places', () => {
  it('lists the places in view beside the map with the place search in the top shell', () => {
    state.places = query<readonly PlaceCountry[]>([
      { countryCode: 'PT', country: 'Portugal', count: 842, coverItemId: null, places: [LISBON] },
    ]);
    const markup = map();
    expect(markup).toContain('data-settings="Map settings"');
    expect(markup).toContain(MAP_COPY.inView);
    expect(markup).toContain(MAP_COPY.find);
    expect(markup).toContain('Lisbon, Portugal, 842 photos');
  });
});

describe('place page states', () => {
  it('labels the item count once, leaving videos to their own figure', () => {
    expect(itemsLabel(1284)).toBe('photos and videos');
    expect(itemsLabel(1)).toBe('photo or video');
  });

  it('points an unknown place back to Map and places', () => {
    state.placeId = 'lisbon';
    expect(placePage()).toContain('Open Map and places');
    state.placeId = '1';
  });

  it('shows a missing place as gone with a way back instead of a retry', () => {
    state.place = query<PhotoPlace>(undefined, new ApiError('not_found', 'There is no such place'));
    const markup = placePage();
    expect(markup).toContain('This place is gone');
    expect(markup).toContain('Open Map and places');
    expect(markup).not.toContain('role="alert"');
  });

  it('says the hub is offline instead of an error when it cannot reach the hub', () => {
    state.place = query<PhotoPlace>(undefined, new Error('Place failed'));
    expect(placePage()).toContain('role="alert"');
    state.sync = 'interrupted';
    expect(placePage()).toContain('This place opens when the hub reconnects');
    state.sync = 'live';
  });

  it('names the page after the place and offers no header actions', () => {
    state.place = query<PhotoPlace>(LISBON);
    const markup = placePage();
    expect(markup).toContain('data-title="Lisbon"');
    expect(markup).not.toContain('<button');
  });
});
