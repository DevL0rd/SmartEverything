import type { SettingsPageDefinition } from './types';

export const PHOTOS_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'photos',
    title: 'Photos settings',
    icon: 'image',
    parent: null,
    group: 'App',
    keywords: ['photos', 'videos', 'library', 'map', 'places', 'sources', 'cameras'],
    childrenInline: false,
  },
  {
    id: 'photos/backup',
    title: 'Backup',
    icon: 'upload',
    parent: 'photos',
    group: null,
    keywords: [
      'backup',
      'camera roll',
      'phone backup',
      'free up space',
      'upload',
      'devices',
      'sync',
    ],
  },
  {
    id: 'photos/duplicates',
    title: 'Duplicates',
    icon: 'copy',
    parent: 'photos',
    group: null,
    keywords: ['duplicates', 'copies', 'similar', 'clean up', 'free space', 'keep best'],
  },
];
