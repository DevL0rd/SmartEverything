import type { SettingsPageDefinition } from './types';

export const PHOTOS_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: 'photos',
    title: 'Photos settings',
    icon: 'image',
    parent: null,
    group: 'App',
    keywords: [
      'photos',
      'videos',
      'backup',
      'camera roll',
      'timeline',
      'memories',
      'map',
      'places',
    ],
  },
];
