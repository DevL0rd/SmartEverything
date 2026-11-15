import { href } from '../../app-shell/hrefs';
import type { PhotosLibraryParams } from '../../app-shell/hrefs-photos';
import type { RouteDefinition } from '../../app-shell/route-types';
import type { PhotosPage } from './model/library-tabs';
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
  readonly path: PhotosPage;
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
    key: 'photos-people',
    path: 'people',
    title: 'People and pets',
    icon: 'users',
    keywords: [
      'people',
      'faces',
      'face grouping',
      'pets',
      'dog',
      'cat',
      'name a person',
      'merge people',
      'not this person',
      'who is in my photos',
    ],
  }),
  page({
    key: 'photos-albums',
    path: 'albums',
    title: 'Albums',
    icon: 'layers',
    keywords: ['smart albums', 'collections', 'trips', 'trip albums'],
  }),
  page({
    key: 'photos-sharing',
    path: 'sharing',
    title: 'Photo sharing',
    icon: 'share',
    keywords: [
      'sharing',
      'shared albums',
      'shared album',
      'share album',
      'album link',
      'add people to album',
      'partner',
      'partner sharing',
      'add partner',
      'family sharing',
      'share all photos',
      'comments',
      'likes',
      'activity',
      'auto-save',
      'save to my library',
    ],
  }),
  page({
    key: 'photos-map',
    path: 'map',
    title: 'Map and places',
    icon: 'mapPin',
    keywords: ['places', 'locations', 'countries', 'cities', 'where'],
  }),
  page({
    key: 'photos-folders',
    path: 'folders',
    title: 'Photo folders',
    icon: 'folder',
    keywords: [
      'folders',
      'local folders',
      'phone albums',
      'device albums',
      'computer folders',
      'hidden folders',
      'hide folder',
      'show hidden',
      'whatsapp',
      'screenshots folder',
      'downloads',
      'camera folder',
      'browse by folder',
    ],
  }),
  page({
    key: 'photos-insights',
    path: 'insights',
    title: 'Photo insights',
    icon: 'trendUp',
    keywords: ['stats', 'statistics', 'library size', 'charts'],
  }),
  page({
    key: 'photos-archive',
    path: 'archive',
    title: 'Photo archive',
    icon: 'archive',
    keywords: [
      'archive',
      'archived photos',
      'archive photos',
      'unarchive',
      'hide from library',
      'hide photos',
      'declutter',
    ],
  }),
  page({
    key: 'photos-locked',
    path: 'locked',
    title: 'Locked folder',
    icon: 'lock',
    keywords: [
      'locked',
      'locked folder',
      'move to locked folder',
      'private photos',
      'secret photos',
      'hidden photos',
      'pin',
      'fingerprint',
    ],
  }),
  entry(
    {
      key: 'photos-edit-meta',
      title: 'Edit photo date and location',
      icon: 'calendar',
      keywords: [
        'edit date',
        'change date',
        'wrong date',
        'shift date',
        'time zone',
        'edit location',
        'change location',
        'remove location',
        'add location',
        'date and location',
      ],
    },
    href.photos(),
  ),
  entry(
    {
      key: 'photos-edit',
      title: 'Edit a photo',
      icon: 'pencil',
      keywords: [
        'edit',
        'photo editor',
        'crop',
        'rotate',
        'straighten',
        'flip',
        'filter',
        'brightness',
        'exposure',
        'contrast',
        'colour',
        'color',
        'erase',
        'eraser',
        'magic eraser',
        'remove object',
        'revert to original',
      ],
    },
    href.photos(),
  ),
  entry(
    {
      key: 'photos-edit-video',
      title: 'Trim or stabilize a video',
      icon: 'film',
      keywords: [
        'trim',
        'cut video',
        'shorten video',
        'stabilize',
        'stabilise',
        'shaky',
        'video editor',
      ],
    },
    href.photos({ tab: 'videos' }),
  ),
  entry(
    {
      key: 'photos-smart-search',
      title: 'Search photos by what is in them',
      icon: 'search',
      keywords: [
        'smart search',
        'find by meaning',
        'semantic search',
        'things in photos',
        'objects',
        'scenes',
        'text in photo',
        'scan text',
        'ocr',
        'copy text from photo',
        'search by person',
        'search by pet',
      ],
    },
    href.photos(),
  ),
  page({
    key: 'photos-deleted',
    path: 'deleted',
    title: 'Recently deleted photos',
    icon: 'trash',
    keywords: ['trash', 'restore', 'bin'],
  }),
];
