import { pluginWidgetType, type PluginRow } from '@smarteverything/domain';

export function boardTypes(plugins: readonly PluginRow[]): string[] {
  const types = plugins
    .filter((plugin) => plugin.enabled)
    .flatMap((plugin) =>
      plugin.manifest.contributes.widgets.map((widget) => pluginWidgetType(plugin.id, widget.id)),
    );
  return [...new Set(types)];
}
