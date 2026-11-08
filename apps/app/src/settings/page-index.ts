import type { SettingEnv } from './types';

export function indexByPage<T extends { readonly page: string }>(
  settings: readonly T[],
): ReadonlyMap<string, T[]> {
  const index = new Map<string, T[]>();
  for (const setting of settings) {
    const list = index.get(setting.page);
    if (list === undefined) {
      index.set(setting.page, [setting]);
    } else {
      list.push(setting);
    }
  }
  return index;
}

export function settingsOfPage<T extends { readonly page: string }>(
  index: ReadonlyMap<string, T[]>,
  page: string,
): readonly T[] {
  return index.get(page) ?? [];
}

export function anyVisible(
  settings: readonly { readonly visible?: (env: SettingEnv) => boolean }[],
  env: SettingEnv,
): boolean {
  return settings.some((setting) => setting.visible?.(env) ?? true);
}
