import { APP_UPDATES_PAGE } from '../features/app-updates/settings';
import { PUSH_RELEASES_PAGE } from '../features/hub-updates/settings';
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
  {
    id: PUSH_RELEASES_PAGE,
    title: 'Push releases',
    icon: 'upload',
    parent: APP_UPDATES_PAGE,
    group: null,
    visible: (env) => env.owner,
    keywords: [
      'push',
      'git push',
      'github',
      'webhook',
      'pipeline',
      'revisions',
      'commits',
      'release history',
      'automatic release',
    ],
  },
];
