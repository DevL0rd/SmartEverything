import type { SettingsPageDefinition } from './types';

export const DRIVE_PAGE = {
  root: 'drive',
  drives: 'drive/drives',
  mount: 'drive/mount',
  phone: 'drive/phone',
  sharing: 'drive/sharing',
  notifications: 'drive/notifications',
  indexing: 'drive/indexing',
  storage: 'drive/storage',
} as const;

export type DrivePageId = (typeof DRIVE_PAGE)[keyof typeof DRIVE_PAGE];

export const DRIVE_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: DRIVE_PAGE.root,
    title: 'Drive settings',
    icon: 'folder',
    parent: null,
    group: 'App',
    keywords: ['drive', 'files', 'folders', 'library', 'indexing', 'sharing', 'storage', 'sync'],
  },
  {
    id: DRIVE_PAGE.drives,
    title: 'Drives',
    icon: 'hardDrive',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'Versions, hidden files and what to skip',
    keywords: ['my drive', 'shared drive', 'versions', 'hidden files', 'skip', 'rescan'],
  },
  {
    id: DRIVE_PAGE.mount,
    title: 'Mount and cache',
    icon: 'folderSync',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'The cache on this computer and advanced mount settings',
    keywords: ['mount', 'cache', 'file manager', 'this computer', 'advanced', 'tuning'],
  },
  {
    id: DRIVE_PAGE.phone,
    title: 'On this phone',
    icon: 'smartphone',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'Offline files and the Files app',
    keywords: ['offline', 'files app', 'this phone'],
  },
  {
    id: DRIVE_PAGE.sharing,
    title: 'Sharing',
    icon: 'share',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'Who can make links and unfinished uploads',
    keywords: ['links', 'share', 'uploads'],
  },
  {
    id: DRIVE_PAGE.notifications,
    title: 'Notifications',
    icon: 'bell',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'What buzzes your phone',
    keywords: ['notifications', 'push', 'alerts'],
  },
  {
    id: DRIVE_PAGE.indexing,
    title: 'Indexing',
    icon: 'search',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'Duplicates, text inside files and change watching',
    keywords: ['index', 'scan', 'duplicates', 'ocr', 'search inside files'],
  },
  {
    id: DRIVE_PAGE.storage,
    title: 'Storage',
    icon: 'server',
    parent: DRIVE_PAGE.root,
    group: null,
    subtitle: 'Space per person, damage checks and backups',
    keywords: ['storage', 'space', 'quota', 'scrub', 'backup'],
  },
];
