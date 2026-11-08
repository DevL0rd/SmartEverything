import type { RouteDefinition } from '../../app-shell/route-types';

interface PageSpec {
  readonly key: string;
  readonly path:
    'recent' | 'starred' | 'shared' | 'activity' | 'sync' | 'computers' | 'storage' | 'trash';
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
    key: 'drive-recent',
    path: 'recent',
    title: 'Recent',
    icon: 'clock',
    keywords: ['recent files', 'changed', 'latest'],
  }),
  page({
    key: 'drive-starred',
    path: 'starred',
    title: 'Starred',
    icon: 'star',
    keywords: ['favourites', 'favorites', 'smart folders'],
  }),
  page({
    key: 'drive-shared',
    path: 'shared',
    title: 'Shared',
    icon: 'share',
    keywords: ['links', 'shared with', 'share links'],
  }),
  page({
    key: 'drive-activity',
    path: 'activity',
    title: 'Drive activity',
    icon: 'activity',
    keywords: ['file history', 'who changed', 'uploads'],
  }),
  page({
    key: 'drive-sync',
    path: 'sync',
    title: 'Sync',
    icon: 'folderSync',
    keywords: ['synced folders', 'conflicts', 'sync status'],
  }),
  page({
    key: 'drive-computers',
    path: 'computers',
    title: 'Drive computers',
    icon: 'monitor',
    keywords: ['computers', 'mount', 'devices syncing'],
  }),
  page({
    key: 'drive-storage',
    path: 'storage',
    title: 'Drive storage',
    icon: 'server',
    keywords: ['space', 'usage', 'quota', 'disk'],
  }),
  page({
    key: 'drive-trash',
    path: 'trash',
    title: 'Drive trash',
    icon: 'trash',
    keywords: ['deleted files', 'restore', 'bin'],
  }),
];
