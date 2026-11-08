import type { SettingsPageDefinition } from './types';

export const DRIVE_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'drive',
    title: 'Drive settings',
    icon: 'folder',
    parent: null,
    group: 'App',
    keywords: ['drive', 'files', 'folders', 'library', 'indexing', 'sharing', 'storage', 'sync'],
  },
];
