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
