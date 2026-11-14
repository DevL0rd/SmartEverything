import { SETTINGS as ACCESS } from '../features/access';
import { SETTINGS as APP_UPDATES } from '../features/app-updates/settings';
import { SETTINGS as ASSISTANT } from '../features/assistant/settings';
import { SETTINGS as AUTOMATIONS } from '../features/automations/settings';
import { SETTINGS as CAMERAS } from '../features/cameras/settings';
import { SETTINGS as CONNECTIONS } from '../features/connections/settings';
import { SETTINGS as CLIPBOARD } from '../features/clipboard';
import { DEVELOPER_SETTINGS as DEVELOPER } from '../features/developer/settings';
import { SETTINGS as DEVICES } from '../features/devices/settings';
import { SETTINGS as DRIVE } from '../features/drive/settings';
import { SETTINGS as FITNESS } from '../features/fitness/settings';
import { SETTINGS as HOME } from '../features/home/settings';
import { SETTINGS as HOME_MAP } from '../features/home-map/settings';
import { SETTINGS as HUB_UPDATES } from '../features/hub-updates/settings';
import { SETTINGS as NUTRITION } from '../features/nutrition/settings';
import { SETTINGS as PHONE } from '../features/phone';
import { PHOTOS_SETTINGS as PHOTOS } from '../features/photos/settings';
import { SETTINGS as PLANNER } from '../features/planner/settings';
import { SETTINGS as PROFILES } from '../features/profiles';
import { SETTINGS as REGION } from '../features/region';
import { SETTINGS as SETTINGS_PAGES } from '../features/settings/settings';
import { SETTINGS as TALK } from '../features/talk';
import { SETTINGS as WATCHES } from '../features/watches';
import { anyVisible, indexByPage, settingsOfPage } from './page-index';
import { onPlatform, settingsPage } from './tree';
import type { SettingDefinition, SettingEnv } from './types';

const SETTINGS: readonly SettingDefinition[] = [
  ...PROFILES,
  ...ACCESS,
  ...DEVICES,
  ...WATCHES,
  ...PHONE,
  ...PHOTOS,
  ...CAMERAS,
  ...FITNESS,
  ...NUTRITION,
  ...PLANNER,
  ...AUTOMATIONS,
  ...DRIVE,
  ...TALK,
  ...ASSISTANT,
  ...SETTINGS_PAGES,
  ...HOME,
  ...HOME_MAP,
  ...REGION,
  ...CLIPBOARD,
  ...DEVELOPER,
  ...CONNECTIONS,
  ...APP_UPDATES,
  ...HUB_UPDATES,
];

class SettingsRegistryError extends Error {
  override readonly name = 'SettingsRegistryError';
}

function validate(settings: readonly SettingDefinition[]): void {
  const seen = new Set<string>();
  for (const setting of settings) {
    if (seen.has(setting.id)) {
      throw new SettingsRegistryError(`Two settings use the id ${setting.id}.`);
    }
    seen.add(setting.id);
    if (settingsPage(setting.page) === undefined) {
      throw new SettingsRegistryError(
        `The setting ${setting.id} names the unknown page ${setting.page}.`,
      );
    }
  }
}

if (__DEV__) {
  validate(SETTINGS);
}

const BY_PAGE = indexByPage(SETTINGS);

export function settingPageOf(id: string): string | undefined {
  return SETTINGS.find((setting) => setting.id === id)?.page;
}

export function settingsOn(page: string, env: SettingEnv): readonly SettingDefinition[] {
  return settingsOfPage(BY_PAGE, page).filter((setting) => setting.visible?.(env) ?? true);
}

export function hasSettingsOn(page: string, env: SettingEnv): boolean {
  return anyVisible(settingsOfPage(BY_PAGE, page), env);
}

export function visibleSettings(env: SettingEnv): readonly SettingDefinition[] {
  return SETTINGS.filter((setting) => {
    const page = settingsPage(setting.page);
    return (
      (setting.visible?.(env) ?? true) &&
      (page?.visible?.(env) ?? true) &&
      (page === undefined || onPlatform(page, env))
    );
  });
}
