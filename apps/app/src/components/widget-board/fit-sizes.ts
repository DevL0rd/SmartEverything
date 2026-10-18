import type { BoardClass, BoardWidget, WidgetDefinition, WidgetSize } from './types';

const NEAREST: Readonly<Record<WidgetSize, readonly WidgetSize[]>> = {
  M: ['W', 'XL'],
  W: ['M', 'XL'],
  XL: ['W', 'M'],
};

function fittedSize(
  definition: WidgetDefinition,
  board: BoardClass,
  size: WidgetSize,
): WidgetSize | undefined {
  const allowed = definition.sizes[board];
  if (allowed.includes(size)) {
    return size;
  }
  return NEAREST[size].find((other) => allowed.includes(other)) ?? allowed[0];
}

export function fittedWidgets(
  widgets: readonly BoardWidget[],
  catalogue: readonly WidgetDefinition[],
  board: BoardClass,
): readonly BoardWidget[] {
  return widgets.map((widget) => {
    const definition = catalogue.find((entry) => entry.type === widget.type);
    const size = definition === undefined ? undefined : fittedSize(definition, board, widget.size);
    return size === undefined || size === widget.size ? widget : { ...widget, size };
  });
}
