import { WIDGET_FOOTPRINTS, type BoardClass, type WidgetSize } from '@smarteverything/domain';
import type { WidgetDefinition } from './types';

export interface Footprint {
  readonly columns: number;
  readonly rows: number;
}

export function footprintOf(
  board: BoardClass,
  size: WidgetSize,
  definition: Pick<WidgetDefinition, 'rows'> | undefined,
): Footprint {
  const base = WIDGET_FOOTPRINTS[board][size];
  const rows = definition?.rows?.[board]?.[size];
  return rows === undefined ? base : { columns: base.columns, rows };
}
