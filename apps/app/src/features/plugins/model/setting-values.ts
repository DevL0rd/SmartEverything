import {
  listItemProblem,
  type JsonValue,
  type PluginListSetting,
  type PluginRow,
  type PluginSetting,
} from '@smarteverything/domain';

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

export function listItems(
  row: PluginRow,
  name: string,
  setting: PluginListSetting,
): readonly string[] {
  const value = settingValue(row, name, setting);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function typedItems(text: string): readonly string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    ),
  ];
}

export function itemsProblem(
  setting: PluginListSetting,
  existing: readonly string[],
  text: string,
): string | null {
  const added = typedItems(text);
  const duplicate = added.find((item) => existing.includes(item));
  if (duplicate !== undefined) {
    return `${duplicate} is already in the list`;
  }
  if (existing.length + added.length > setting.maxItems) {
    return `The list holds up to ${String(setting.maxItems)} items`;
  }
  for (const item of added) {
    const problem = listItemProblem(setting, item);
    if (problem !== null) {
      return `${item}: ${problem}`;
    }
  }
  return null;
}
