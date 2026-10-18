import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { WIDGET_FOOTPRINTS, type BoardClass, type WidgetSize } from '@smarteverything/domain';
import { useIdiom } from '../../../design/platform';
import { frameOf, spanWidth, type Cell } from '../board-geometry';
import { frameBoxOf } from '../frame-class';
import type { WidgetDefinition } from '../types';
import { renderPreview } from '../widget-scope';

function boxStyle(width: number, height: number): ViewStyle {
  return { width, height };
}

function scaledStyle(width: number, height: number, scale: number): ViewStyle {
  return { width, height, transform: [{ scale }], transformOrigin: 'top left' };
}

export interface GalleryPreviewProps {
  readonly definition: WidgetDefinition;
  readonly size: WidgetSize;
  readonly board: BoardClass;
  readonly cell: Cell;
  readonly options?: unknown;
  readonly maxWidth: number;
}

export function GalleryPreview({
  definition,
  size,
  board,
  cell,
  options,
  maxWidth,
}: GalleryPreviewProps): ReactNode {
  const idiom = useIdiom();
  const footprint = WIDGET_FOOTPRINTS[board][size];
  const frame = frameOf(cell, {
    col: 0,
    row: 0,
    cols: footprint.columns,
    rows: footprint.rows,
    height:
      definition.aspect === undefined
        ? undefined
        : spanWidth(cell, footprint.columns) / definition.aspect,
  });
  const content = renderPreview(definition, frameBoxOf(frame, cell.pad, idiom), options);
  if (content === null) {
    return null;
  }
  const scale = Math.min(1, maxWidth / frame.width);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={boxStyle(frame.width * scale, frame.height * scale)}
      className="shrink-0 overflow-hidden rounded-lg"
    >
      <View style={scaledStyle(frame.width, frame.height, scale)}>{content}</View>
    </View>
  );
}
