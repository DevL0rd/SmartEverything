import { AUTOMATION_CLIENT_PREFS } from './automation-v3/prefs';
import { DRIVE_CLIENT_PREFS } from './drive/prefs';
import { HOME_MAP_CLIENT_PREFS } from './home-map-prefs';
import { PHOTOS_CLIENT_PREFS } from './photos/prefs';

export const FEATURE_CLIENT_PREFS = {
  ...AUTOMATION_CLIENT_PREFS,
  ...HOME_MAP_CLIENT_PREFS,
  ...PHOTOS_CLIENT_PREFS,
  ...DRIVE_CLIENT_PREFS,
} as const;
