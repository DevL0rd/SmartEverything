import { memo, useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Logger } from '@smarteverything/logging';
import type { WidgetFrameBox } from '../../../components/widget-board';
import { tierHeight } from '../../../components/widget-board/tier';
import { LogTally } from '../../../design/log-tally';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { GUTTER, SEMANTIC_SIZES, type Idiom } from '../../../design/tokens';
import { ScrollModelLayer } from '../../models';
import { sameRow, type PackedRow } from '../model/row-pack';
import { DeviceCell } from './device-cell';

const log = new Logger('app.device-list');
const mounts = new LogTally(log, 'grid.rows_summarised', 5000);

export interface CellSize {
  readonly gap: number;
  readonly height: number;
  readonly fill: number;
  readonly gutter: number;
  readonly idiom: Idiom;
  readonly pad: number;
  readonly perRow: number;
  readonly column: number;
}

export function useCellSize(): CellSize {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const sizes = SEMANTIC_SIZES[idiom][density];
  return {
    gap: sizes.gridGap,
    height: tierHeight('M', idiom, density),
    fill: tierHeight('XL', idiom, density),
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
    surface: 'device-grid',
  };
}

interface GridRowProps {
  readonly row: PackedRow;
  readonly cell: CellSize;
}

function GridRow({ row, cell }: GridRowProps): ReactNode {
  const box: ViewStyle = {
    flexDirection: 'row',
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
    <ScrollModelLayer key={row.key} style={box}>
      {row.devices.map((device) => (
        <View key={device.id} style={slot(1)}>
          <DeviceCell device={device} frame={frame} />
        </View>
      ))}
      {count < cell.perRow ? <View style={slot(cell.perRow - count)} /> : null}
    </ScrollModelLayer>
  );
}

export const GridRowView = memo(
  GridRow,
  (left, right) =>
    left.cell.pad === right.cell.pad &&
    left.cell.gap === right.cell.gap &&
    left.cell.height === right.cell.height &&
    left.cell.column === right.cell.column &&
    left.cell.perRow === right.cell.perRow &&
    left.cell.idiom === right.cell.idiom &&
    sameRow(left.row, right.row),
);
