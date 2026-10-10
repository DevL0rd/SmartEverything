import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { VirtualList, type VirtualSection } from '../../../components/virtual-list';
import { useIdiom } from '../../../design/platform';
import { useAppliedTheme } from '../../../design/theme';
import { SEMANTIC_SIZES, type Idiom } from '../../../design/tokens';
import { plural } from '../../../format/text';
import type { RoomGroup } from '../../../store/room-groups';
import type { Device } from '../../../store/state';
import type { Slot } from '../model/cell-span';
import { useCardWeights, type Weights } from '../model/card-weights';
import { packRows, type PackedRow } from '../model/row-pack';
import { DeviceCell } from './device-cell';

const MIN_CELL: Readonly<Record<Idiom, number>> = { pointer: 196, touch: 172 };
const CELL_HEIGHT: Readonly<Record<Idiom, number>> = { pointer: 196, touch: 220 };
const MAX_COLUMNS = 6;
const GUTTERS = 32;

function columnsFor(width: number, gap: number, minimum: number): number {
  const fit = Math.floor((width + gap) / (minimum + gap));
  return Math.min(MAX_COLUMNS, Math.max(2, fit));
}

function sectionsOf(
  groups: readonly RoomGroup<Device>[],
  columns: number,
  weights: Weights,
): readonly VirtualSection<PackedRow>[] {
  return groups.map((group) => ({
    key: group.key,
    title: `${group.title} · ${plural(group.devices.length, 'device')}`,
    data: packRows(group.devices, columns, weights).map((row) => ({
      ...row,
      key: `${group.key}:${row.key}`,
    })),
  }));
}

interface CellSize {
  readonly gap: number;
  readonly height: number;
  readonly minimum: number;
}

function useCellSize(): CellSize {
  const idiom = useIdiom();
  const sizes = SEMANTIC_SIZES[idiom][useAppliedTheme().settings.density];
  return {
    gap: sizes.gridGap,
    height: CELL_HEIGHT[idiom],
    minimum: MIN_CELL[idiom],
  };
}

function stackOf(gap: number): ViewStyle {
  return { rowGap: gap };
}

function SlotView({ entry, gap }: { readonly entry: Slot; readonly gap: number }): ReactNode {
  const [first, second] = entry.devices;
  if (first === undefined) {
    return null;
  }
  if (!entry.half) {
    return <DeviceCell device={first} wide={entry.span >= 2} />;
  }
  return (
    <View style={stackOf(gap)} className="flex-1">
      <View className="flex-1">
        <DeviceCell device={first} wide={false} />
      </View>
      <View className="flex-1">
        {second === undefined ? null : <DeviceCell device={second} wide={false} />}
      </View>
    </View>
  );
}

function GridRowView({
  row,
  cell,
}: {
  readonly row: PackedRow;
  readonly cell: CellSize;
}): ReactNode {
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
  return (
    <View style={box} className="flex-row">
      {row.slots.map((entry) => (
        <View key={entry.key} style={slot(entry.span)}>
          <SlotView entry={entry} gap={cell.gap} />
        </View>
      ))}
      {row.free > 0 ? <View style={slot(row.free)} /> : null}
    </View>
  );
}

export function DeviceGrid({
  groups,
  header,
  empty,
}: {
  readonly groups: readonly RoomGroup<Device>[];
  readonly header: ReactElement;
  readonly empty: ReactElement;
}): ReactNode {
  const [width, setWidth] = useState(0);
  const cell = useCellSize();
  const weights = useCardWeights(groups.flatMap((group) => group.devices));
  const columns = columnsFor(width - GUTTERS, cell.gap, cell.minimum);
  return (
    <View
      className="flex-1"
      onLayout={(event) => {
        setWidth(Math.round(event.nativeEvent.layout.width));
      }}
    >
      {width === 0 ? null : (
        <VirtualList
          sections={sectionsOf(groups, columns, weights)}
          keyOf={(row) => row.key}
          widthClassName="max-w-dashboard"
          header={header}
          empty={empty}
          renderItem={(row) => <GridRowView row={row} cell={cell} />}
        />
      )}
    </View>
  );
}
