import { pluginWidgetType, type PluginUiRow, type WidgetSpec } from '@smarteverything/domain';
import type { WidgetDefinition } from '../../components/widget-board';
import { DeclaredWidget } from './declared-widget';
import { extensionIcon } from './extension-icon';

class WidgetWithoutSizeError extends Error {
  override readonly name = 'WidgetWithoutSizeError';

  constructor(pluginId: string, widgetId: string) {
    super(`The widget ${widgetId} of ${pluginId} declares no size.`);
  }
}

function declaredWidget(ui: PluginUiRow, spec: WidgetSpec): WidgetDefinition {
  const icon = extensionIcon(spec.icon);
  const [first] = spec.sizes;
  if (first === undefined) throw new WidgetWithoutSizeError(ui.id, spec.id);
  return {
    type: pluginWidgetType(ui.id, spec.id),
    title: spec.title,
    icon,
    group: ui.name,
    sizes: { compact: spec.sizes, medium: spec.sizes, expanded: spec.sizes },
    defaultSize: first,
    render: ({ size }) => (
      <DeclaredWidget
        pluginId={ui.id}
        title={spec.title}
        icon={icon}
        body={spec.body}
        size={size}
      />
    ),
  };
}

export function extensionWidgets(
  rows: readonly PluginUiRow[],
  compiledTypes: ReadonlySet<string>,
  currentType: (type: string) => string,
): readonly WidgetDefinition[] {
  return rows
    .flatMap((ui) => ui.widgets.map((spec) => declaredWidget(ui, spec)))
    .filter((definition) => !compiledTypes.has(currentType(definition.type)));
}
