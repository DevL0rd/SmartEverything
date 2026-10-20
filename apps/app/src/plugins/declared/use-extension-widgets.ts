import { useMemo } from 'react';
import type { WidgetDefinition } from '../../components/widget-board';
import { useRows } from '../../store/selectors';
import { APP_PLUGINS, currentPluginWidgetType } from '../registry';
import { extensionWidgets } from './declared-widgets';

const PLUGIN_WIDGET_TYPES: readonly string[] = APP_PLUGINS.flatMap((plugin) =>
  plugin.widgets.map((widget) => widget.type),
);

export function useExtensionWidgets(
  compiled: readonly WidgetDefinition[],
): readonly WidgetDefinition[] {
  const rows = useRows('plugin_ui');
  return useMemo(
    () =>
      extensionWidgets(
        rows,
        new Set([...PLUGIN_WIDGET_TYPES, ...compiled.map((definition) => definition.type)]),
        currentPluginWidgetType,
      ),
    [rows, compiled],
  );
}
