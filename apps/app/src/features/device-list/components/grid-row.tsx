import { memo, useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Logger } from '@smarteverything/logging';
import type { WidgetFrameBox } from '../../../components/widget-board';
import { LogTally } from '../../../design/log-tally';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { GUTTER, SEMANTIC_SIZES, type Idiom } from '../../../design/tokens';
import { sameRow, type PackedRow } from '../model/row-pack';
import { DeviceCell } from './device-cell';

const log = new Logger('app.device-list');
const mounts = new LogTally(log, 'grid.rows_summarised', 5000);

const CELL_HEIGHT: Readonly<Record<Idiom, number>> = { pointer: 196, touch: 220 };

export interface CellSize {
  readonly gap: number;
  readonly height: number;
  readonly gutter: number;
  readonly idiom: Idiom;
  readonly pad: number;
  readonly perRow: number;
  readonly column: number;
}

export function useCellSize(): CellSize {
  const idiom = useIdiom();
  const sizes = SEMANTIC_SIZES[idiom][useThemeSetting('density')];
  return {
    gap: sizes.gridGap,
    height: CELL_HEIGHT[idiom],
    gutter: GUTTER[useSizeClass().width] - sizes.gutterShrink,
    idiom,
    pad: sizes.cardPad,
    perRow: 1,
    column: 0,
  };
}

function frameOf(cell: CellSize): WidgetFrameBox {
  return {
    width: cell.column - 2 * cell.pad,
    height: cell.height - 2 * cell.pad,
    idiom: cell.idiom,
  };
}

interface GridRowProps {
  readonly row: PackedRow;
  readonly cell: CellSize;
}

function GridRow({ row, cell }: GridRowProps): ReactNode {
  const box = {
    height: cell.height,
    marginBottom: cell.gap,
    marginHorizontal: -cell.gap / 2,
  };
  const slot = (span: number): ViewStyle => ({
    flexBasis: 0,
    flexGrow: span,
    paddingHorizontal: cell.gap / 2,
  });
  const count = row.devices.length;
  const frame = frameOf(cell);
  useEffect(() => {
    mounts.bump('rowsMounted');
    mounts.bump('cellsMounted', count);
    return (): void => {
      mounts.bump('rowsUnmounted');
      mounts.bump('cellsUnmounted', count);
    };
  }, [count]);
  return (
    <View style={box} className="flex-row">
      {row.devices.map((device) => (
        <View key={device.id} style={slot(1)}>
          <DeviceCell device={device} frame={frame} />
        </View>
      ))}
      {count < cell.perRow ? <View style={slot(cell.perRow - count)} /> : null}
    </View>
  );
}

export const GridRowView = memo(
  GridRow,
  (left, right) =>
    left.cell.gap === right.cell.gap &&
    left.cell.height === right.cell.height &&
    left.cell.column === right.cell.column &&
    left.cell.perRow === right.cell.perRow &&
    left.cell.idiom === right.cell.idiom &&
    sameRow(left.row, right.row),
);
