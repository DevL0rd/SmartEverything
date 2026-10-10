import type { JsonValue, PluginRow, PluginSetting } from '@smarteverything/domain';

export type TextSetting = Extract<PluginSetting, { type: 'string' | 'number' }>;

export function settingValue(row: PluginRow, name: string, setting: PluginSetting): JsonValue {
  return row.settings[name] ?? setting.default;
}

export function settingText(value: JsonValue): string {
  if (value === null) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function shownValue(row: PluginRow, name: string, setting: TextSetting): string {
  if (setting.type === 'string' && setting.secret) {
    return row.secret_names.includes(name) ? 'Set' : 'Not set';
  }
  const text = settingText(settingValue(row, name, setting));
  return text === '' ? 'Not set' : text;
}

export function numberProblem(
  setting: Extract<PluginSetting, { type: 'number' }>,
  value: string,
): string | null {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 'Enter a number';
  }
  if (setting.minimum !== null && number < setting.minimum) {
    return `Use ${String(setting.minimum)} or more`;
  }
  return setting.maximum !== null && number > setting.maximum
    ? `Use ${String(setting.maximum)} or less`
    : null;
}
