import { href, type PhotosLibraryParams } from '../../app-shell/hrefs';
import type { RouteDefinition } from '../../app-shell/route-types';
import { desktopBridge, isNative } from '../../design/platform';

type LibraryTab = NonNullable<PhotosLibraryParams['tab']>;

interface EntrySpec {
  readonly key: string;
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
  readonly available?: RouteDefinition['available'];
}

interface PageSpec extends EntrySpec {
  readonly path: 'albums' | 'map' | 'insights' | 'deleted';
}

interface TabSpec extends EntrySpec {
  readonly tab: LibraryTab;
}

function always(): boolean {
  return true;
}

function hasLocalMedia(): boolean {
  return isNative() || desktopBridge()?.photos !== undefined;
}

function entry(spec: EntrySpec, target: RouteDefinition['href']): RouteDefinition {
  return {
    key: spec.key,
    href: target,
    title: spec.title,
    icon: spec.icon,
    tab: 'photos',
    parent: 'photos',
    keywords: spec.keywords,
    available: spec.available ?? always,
    searchable: true,
  };
}

function page(spec: PageSpec): RouteDefinition {
  return entry(spec, href.photosPage(spec.path));
}

function libraryTab(spec: TabSpec): RouteDefinition {
  return entry(spec, href.photos({ tab: spec.tab }));
}

export const ROUTES: readonly RouteDefinition[] = [
  libraryTab({
    key: 'photos-favourites',
    tab: 'favourites',
    title: 'Favourite photos',
    icon: 'star',
    keywords: ['favorites', 'starred', 'best'],
  }),
  libraryTab({
    key: 'photos-videos',
    tab: 'videos',
    title: 'Videos',
    icon: 'film',
    keywords: ['clips', 'movies', 'recordings'],
  }),
  libraryTab({
    key: 'photos-screenshots',
    tab: 'screenshots',
    title: 'Screenshots',
    icon: 'smartphone',
    keywords: ['screen captures', 'screen grabs'],
  }),
  libraryTab({
    key: 'photos-device',
    tab: 'device',
    title: 'Photos on this device',
    icon: 'smartphone',
    keywords: ['local photos', 'phone gallery', 'not backed up', 'this phone', 'this computer'],
    available: hasLocalMedia,
  }),
  libraryTab({
    key: 'photos-cameras',
    tab: 'cameras',
    title: 'Camera photos',
    icon: 'camera',
    keywords: ['camera snapshots', 'camera clips', 'recorded by cameras'],
  }),
  libraryTab({
    key: 'photos-ai',
    tab: 'ai',
    title: 'Made with AI',
    icon: 'sparkles',
    keywords: ['generated images', 'ai images', 'assistant images'],
  }),
  page({
    key: 'photos-albums',
    path: 'albums',
    title: 'Albums',
    icon: 'layers',
    keywords: ['smart albums', 'collections', 'trips', 'trip albums'],
  }),
  page({
    key: 'photos-map',
    path: 'map',
    title: 'Map and places',
    icon: 'mapPin',
    keywords: ['places', 'locations', 'countries', 'cities', 'where'],
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
