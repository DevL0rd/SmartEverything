import type { RouteDefinition } from '../../app-shell/route-types';

interface PageSpec {
  readonly key: string;
  readonly path:
    | 'search'
    | 'memories'
    | 'albums'
    | 'map'
    | 'favourites'
    | 'videos'
    | 'screenshots'
    | 'cameras'
    | 'ai'
    | 'duplicates'
    | 'backup'
    | 'insights'
    | 'deleted';
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
}

function page({ key, path, title, icon, keywords }: PageSpec): RouteDefinition {
  return {
    key,
    href: `/photos/${path}`,
    title,
    icon,
    tab: 'photos',
    parent: 'photos',
    keywords,
    available: () => true,
    searchable: true,
  };
}

export const ROUTES: readonly RouteDefinition[] = [
  page({
    key: 'photos-search',
    path: 'search',
    title: 'Search photos',
    icon: 'search',
    keywords: ['find photos', 'places', 'dates', 'cameras'],
  }),
  page({
    key: 'photos-memories',
    path: 'memories',
    title: 'Memories',
    icon: 'clock',
    keywords: ['on this day', 'trips', 'year in review', 'highlights'],
  }),
  page({
    key: 'photos-albums',
    path: 'albums',
    title: 'Albums',
    icon: 'layers',
    keywords: ['smart albums', 'collections'],
  }),
  page({
    key: 'photos-map',
    path: 'map',
    title: 'Map and places',
    icon: 'mapPin',
    keywords: ['places', 'locations', 'countries', 'cities', 'where'],
  }),
  page({
    key: 'photos-favourites',
    path: 'favourites',
    title: 'Favourite photos',
    icon: 'star',
    keywords: ['favorites', 'starred', 'best'],
  }),
  page({
    key: 'photos-videos',
    path: 'videos',
    title: 'Videos',
    icon: 'film',
    keywords: ['clips', 'movies', 'recordings'],
  }),
  page({
    key: 'photos-screenshots',
    path: 'screenshots',
    title: 'Screenshots',
    icon: 'smartphone',
    keywords: ['screen captures', 'screen grabs'],
  }),
  page({
    key: 'photos-cameras',
    path: 'cameras',
    title: 'Camera photos',
    icon: 'camera',
    keywords: ['camera snapshots', 'camera clips', 'recorded by cameras'],
  }),
  page({
    key: 'photos-ai',
    path: 'ai',
    title: 'Made with AI',
    icon: 'sparkles',
    keywords: ['generated images', 'ai images', 'assistant images'],
  }),
  page({
    key: 'photos-duplicates',
    path: 'duplicates',
    title: 'Duplicate photos',
    icon: 'copy',
    keywords: ['copies', 'similar', 'clean up', 'free space'],
  }),
  page({
    key: 'photos-backup',
    path: 'backup',
    title: 'Photo backup',
    icon: 'upload',
    keywords: ['camera roll', 'phone backup', 'free up space', 'upload'],
  }),
  page({
    key: 'photos-insights',
    path: 'insights',
    title: 'Photo insights',
    icon: 'trendUp',
    keywords: ['stats', 'statistics', 'library size', 'charts'],
  }),
  page({
    key: 'photos-deleted',
    path: 'deleted',
    title: 'Recently deleted photos',
    icon: 'trash',
    keywords: ['trash', 'restore', 'bin'],
  }),
];
