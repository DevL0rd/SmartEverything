import type { SettingDefinition } from '../../settings/types';
import { APPEARANCE_SETTINGS } from './appearance/appearance-settings';
import { HOME_SETTINGS } from './home/home-settings';
import { NOTIFICATION_SETTINGS } from './notifications/notification-settings';
import { OTHER_SETTINGS } from './other-settings';

export const SETTINGS: readonly SettingDefinition[] = [
  ...HOME_SETTINGS,
  ...OTHER_SETTINGS,
  ...APPEARANCE_SETTINGS,
  ...NOTIFICATION_SETTINGS,
];
