import { APP_UPDATES_PAGE } from '../features/app-updates/settings';
import type { SettingsPageDefinition } from './types';

export const APP_UPDATE_PAGES: readonly SettingsPageDefinition[] = [
  {
    id: APP_UPDATES_PAGE,
    title: 'Updates',
    icon: 'download',
    parent: null,
    group: 'System',
    keywords: [
      'update',
      'upgrade',
      'version',
      'ota',
      'over the air',
      'restart',
      'apk',
      'desktop',
      'hub',
      'github',
      'git',
      'recover update',
    ],
  },
];
