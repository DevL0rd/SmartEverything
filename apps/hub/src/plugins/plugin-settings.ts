import {
  ApiError,
  settingFits,
  type JsonValue,
  type PluginRow,
  type PluginSetting,
} from '@smarteverything/domain';
import { HumanOnlySettingError } from './plugin-setting-errors';

export interface SettingsSplit {
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly secrets: Readonly<Record<string, string>>;
}

export type SettingsAuthor = 'person' | 'assistant' | 'plugin';

function checked(
  key: string,
  setting: PluginSetting | undefined,
  value: JsonValue,
  author: SettingsAuthor,
): PluginSetting {
  if (setting === undefined) {
    throw new ApiError('invalid_request', `This plugin has no setting named ${key}.`);
  }
  if (setting.humanOnly && author !== 'person') {
    throw new HumanOnlySettingError(setting, author === 'plugin' ? 'the plugin itself' : 'an AI');
  }
  if (value !== null && !settingFits(setting, value)) {
    throw new ApiError('invalid_request', `${setting.title} does not accept that value.`);
  }
  return setting;
}

export function splitSettings(
  row: PluginRow,
  change: Readonly<Record<string, JsonValue>>,
  author: SettingsAuthor,
): SettingsSplit {
  const declared = row.manifest.contributes.settings;
  const settings: Record<string, JsonValue> = { ...row.settings };
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(change)) {
    const setting = checked(key, declared[key], value, author);
    if (setting.type === 'string' && setting.secret) {
      secrets[key] = typeof value === 'string' ? value : '';
    } else {
      settings[key] = value;
    }
  }
  return { settings, secrets };
}

export function checkedSecrets(
  row: PluginRow,
  secrets: Readonly<Record<string, string>>,
  author: SettingsAuthor,
): Readonly<Record<string, string>> {
  const declared = row.manifest.contributes.settings;
  for (const [key, value] of Object.entries(secrets)) {
    const setting = checked(key, declared[key], value, author);
    if (setting.type !== 'string' || !setting.secret) {
      throw new ApiError('invalid_request', `${setting.title} is not a secret setting.`);
    }
  }
  return secrets;
}
