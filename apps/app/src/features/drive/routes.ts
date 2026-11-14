import type { RouteDefinition } from '../../app-shell/route-types';
import type { DrivePageSection } from './model/section-routes';

interface PageSpec {
  readonly key: string;
  readonly path: DrivePageSection;
  readonly title: string;
  readonly icon: RouteDefinition['icon'];
  readonly keywords: readonly string[];
}

function page({ key, path, title, icon, keywords }: PageSpec): RouteDefinition {
  return {
    key,
    href: `/drive/${path}`,
    title,
    icon,
    tab: 'drive',
    parent: 'drive',
    keywords,
    available: () => true,
    searchable: true,
  };
}

export const ROUTES: readonly RouteDefinition[] = [
  page({
    key: 'drive-shared-drive',
    path: 'shared-drive',
    title: 'Shared Drive',
    icon: 'users',
    keywords: ['shared drive', 'home drive', 'family files', 'everyone', 'household files'],
  }),
  page({
    key: 'drive-shared',
    path: 'shared',
    title: 'Shared with me',
    icon: 'share',
    keywords: ['shared with me', 'shared by me', 'people', 'links', 'share links', 'sharing'],
  }),
  page({
    key: 'drive-recent',
    path: 'recent',
    title: 'Recent',
    icon: 'history',
    keywords: ['recent files', 'changed', 'latest', 'opened'],
  }),
  page({
    key: 'drive-starred',
    path: 'starred',
    title: 'Starred',
    icon: 'star',
    keywords: ['starred', 'favourites', 'favorites', 'smart folders'],
  }),
  page({
    key: 'drive-activity',
    path: 'activity',
    title: 'Drive activity',
    icon: 'activity',
    keywords: ['file history', 'who changed', 'uploads', 'changes'],
  }),
  page({
    key: 'drive-computers',
    path: 'computers',
    title: 'Drive computers',
    icon: 'laptop',
    keywords: [
      'computers',
      'sync',
      'synced folders',
      'mount',
      'mounted drive',
      'offline',
      'conflicts',
      'sync status',
    ],
  }),
  page({
    key: 'drive-storage',
    path: 'storage',
    title: 'Drive storage',
    icon: 'chartPie',
    keywords: ['space', 'usage', 'quota', 'disk', 'data folder'],
  }),
  page({
    key: 'drive-trash',
    path: 'trash',
    title: 'Drive trash',
    icon: 'trash',
    keywords: ['deleted files', 'restore', 'bin', 'recycle'],
  }),
];
