import {
  ApiError,
  type JsonValue,
  type PluginRow,
  type PluginSetting,
} from '@smarteverything/domain';

export interface SettingsSplit {
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly secrets: Readonly<Record<string, string>>;
}

function fits(setting: PluginSetting, value: JsonValue): boolean {
  switch (setting.type) {
    case 'string':
      return typeof value === 'string' && value.length <= 2000;
    case 'number':
      return (
        typeof value === 'number' &&
        (setting.minimum === null || value >= setting.minimum) &&
        (setting.maximum === null || value <= setting.maximum)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return setting.options.some((option) => option.value === value);
  }
}

function checked(key: string, setting: PluginSetting | undefined, value: JsonValue): PluginSetting {
  if (setting === undefined) {
    throw new ApiError('invalid_request', `This plugin has no setting named ${key}.`);
  }
  if (value !== null && !fits(setting, value)) {
    throw new ApiError('invalid_request', `${setting.title} does not accept that value.`);
  }
  return setting;
}

export function splitSettings(
  row: PluginRow,
  change: Readonly<Record<string, JsonValue>>,
): SettingsSplit {
  const declared = row.manifest.contributes.settings;
  const settings: Record<string, JsonValue> = { ...row.settings };
  const secrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(change)) {
    const setting = checked(key, declared[key], value);
    if (setting.type === 'string' && setting.secret) {
      secrets[key] = typeof value === 'string' ? value : '';
    } else {
      settings[key] = value;
    }
  }
  return { settings, secrets };
}
