import { SETTINGS as ASSISTANT } from '../features/assistant/settings';
import { SETTINGS as AUTOMATIONS } from '../features/automations/settings';
import { SETTINGS as CAMERAS } from '../features/cameras/settings';
import { SETTINGS as CLIMATE } from '../features/climate/settings';
import { SETTINGS as CONNECTIONS } from '../features/connections/settings';
import { SETTINGS as DEVICES } from '../features/devices/settings';
import { SETTINGS as FITNESS } from '../features/fitness/settings';
import { SETTINGS as HOME } from '../features/home/settings';
import { SETTINGS as NUTRITION } from '../features/nutrition/settings';
import { SETTINGS as PHONE } from '../features/phone';
import { SETTINGS as PROFILES } from '../features/profiles';
import { SETTINGS as REGION } from '../features/region';
import { SETTINGS as SETTINGS_PAGES } from '../features/settings/settings';
import { SETTINGS as TALK } from '../features/talk';
import { SETTINGS as WATCHES } from '../features/watches';
import { onPlatform, settingsPage } from './tree';
import type { SettingDefinition, SettingEnv } from './types';

const SETTINGS: readonly SettingDefinition[] = [
  ...HOME,
  ...PROFILES,
  ...DEVICES,
  ...WATCHES,
  ...PHONE,
  ...CLIMATE,
  ...CAMERAS,
  ...FITNESS,
  ...NUTRITION,
  ...AUTOMATIONS,
  ...TALK,
  ...ASSISTANT,
  ...SETTINGS_PAGES,
  ...REGION,
  ...CONNECTIONS,
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

export function settingsOn(page: string, env: SettingEnv): readonly SettingDefinition[] {
  return SETTINGS.filter((setting) => setting.page === page && (setting.visible?.(env) ?? true));
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
