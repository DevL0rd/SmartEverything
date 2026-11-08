import type { SettingDefinition } from '../../settings/types';

import { UPDATES_SETTINGS_PAGE } from '../../app-shell/hrefs';

export const APP_UPDATES_PAGE = UPDATES_SETTINGS_PAGE;
export const APP_UPDATES_PATH = `/settings/${APP_UPDATES_PAGE}`;
export const ANDROID_INSTALLER_SETTING = 'app-updates.android-installer';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: ANDROID_INSTALLER_SETTING,
    page: APP_UPDATES_PAGE,
    title: 'Install Android update',
    keywords: ['android', 'apk', 'install', 'update'],
    scope: 'device-local',
    control: 'listed',
    in: ANDROID_INSTALLER_SETTING,
    visible: (env) => env.platform === 'android',
  },
];
