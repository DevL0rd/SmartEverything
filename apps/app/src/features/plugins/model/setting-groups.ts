import type { PluginSetting } from '@smarteverything/domain';

export interface SettingGroup {
  readonly title: string | null;
  readonly fields: readonly (readonly [string, PluginSetting])[];
}

export function settingGroups(
  fields: readonly (readonly [string, PluginSetting])[],
): readonly SettingGroup[] {
  const titles = [...new Set(fields.map(([, setting]) => setting.group))];
  return titles.map((title) => ({
    title,
    fields: fields.filter(([, setting]) => setting.group === title),
  }));
}
