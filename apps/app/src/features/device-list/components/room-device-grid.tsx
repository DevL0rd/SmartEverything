import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import type { Device } from '../../../store/state';
import { columnsFor } from '../model/grid-columns';
import { packRows } from '../model/row-pack';
import { GridRowView, useCellSize } from './grid-row';

function Rows({
  devices,
  width,
}: {
  readonly devices: readonly Device[];
  readonly width: number;
}): ReactNode {
  const base = useCellSize();
  const perRow = columnsFor(width, base.gap);
  const cell = { ...base, perRow, column: (width + base.gap) / perRow - base.gap };
  const rows = useMemo(() => packRows(devices, perRow), [devices, perRow]);
  return (
    <View>
      {rows.map((row) => (
        <GridRowView key={row.key} row={row} cell={cell} />
      ))}
    </View>
  );
}

export function RoomDeviceGrid({ devices }: { readonly devices: readonly Device[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth(Math.round);
  return (
    <View onLayout={onLayout}>{width === 0 ? null : <Rows devices={devices} width={width} />}</View>
  );
}
