import type { AppPlugin } from '../contract';

export function currentWidgetType(
  plugins: readonly Pick<AppPlugin, 'widgetAliases'>[],
  type: string,
): string {
  for (const plugin of plugins) {
    const current = plugin.widgetAliases?.[type];
    if (current !== undefined) {
      return current;
    }
  }
  return type;
}
