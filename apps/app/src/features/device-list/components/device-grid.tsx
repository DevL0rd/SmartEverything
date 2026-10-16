import type { ReactElement, ReactNode } from 'react';
import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { VirtualList, type VirtualSection } from '../../../components/virtual-list';
import { useIdiom } from '../../../design/platform';
import { useAppliedTheme } from '../../../design/theme';
import { SEMANTIC_SIZES, type Idiom } from '../../../design/tokens';
import { deviceFamily } from '@smarteverything/domain';
import { DeviceGroupCard } from '../../device-groups';
import { plural } from '../../../format/text';
import type { RoomGroup } from '../../../store/room-groups';
import type { Device } from '../../../store/state';
import type { Slot } from '../model/cell-span';
import { cardWeightsOf, type Weights } from '../model/card-weights';
import { packRows, type PackedRow } from '../model/row-pack';
import { DeviceCell } from './device-cell';

const MIN_CELL: Readonly<Record<Idiom, number>> = { pointer: 196, touch: 172 };
const CELL_HEIGHT: Readonly<Record<Idiom, number>> = { pointer: 196, touch: 220 };
const MAX_COLUMNS = 6;
const WINDOW_SIZE = 3;
const INITIAL_ROWS = 3;
const GUTTERS = 32;

function columnsFor(width: number, gap: number, minimum: number): number {
  const fit = Math.floor((width + gap) / (minimum + gap));
  return Math.min(MAX_COLUMNS, Math.max(2, fit));
}

type GridEntry =
  | { readonly kind: 'lights'; readonly key: string; readonly devices: readonly Device[] }
  | { readonly kind: 'devices'; readonly key: string; readonly row: PackedRow };

function sectionsOf(
  groups: readonly RoomGroup<Device>[],
  all: readonly Device[],
  columns: number,
  weights: Weights,
): readonly VirtualSection<GridEntry>[] {
  return groups.map((group) => {
    const lights = all.filter(
      (device) =>
        !device.hidden &&
        deviceFamily(device) === 'light' &&
        (device.room_id === group.key || (group.key === 'none' && device.room_id === null)),
    );
    const data: GridEntry[] =
      lights.length === 0 ? [] : [{ kind: 'lights', key: `${group.key}:lights`, devices: lights }];
    return {
      key: group.key,
      title: `${group.title} · ${plural(group.devices.length, 'device')}`,
      data: [
        ...data,
        ...packRows(group.devices, columns, weights).map((row) => ({
          kind: 'devices' as const,
          key: `${group.key}:${row.key}`,
          row,
        })),
      ],
    };
  });
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

interface GridRowProps {
  readonly row: PackedRow;
  readonly cell: CellSize;
}

function sameSlot(left: Slot, right: Slot): boolean {
  return (
    left.key === right.key &&
    left.span === right.span &&
    left.half === right.half &&
    left.devices.length === right.devices.length &&
    left.devices.every((device, index) => device === right.devices[index])
  );
}

function sameRow(left: PackedRow, right: PackedRow): boolean {
  return (
    left.key === right.key &&
    left.free === right.free &&
    left.slots.length === right.slots.length &&
    left.slots.every((slot, index) => {
      const other = right.slots[index];
      return other !== undefined && sameSlot(slot, other);
    })
  );
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

const GridRowView = memo(
  GridRow,
  (left, right) =>
    left.cell.gap === right.cell.gap &&
    left.cell.height === right.cell.height &&
    sameRow(left.row, right.row),
);

function sameEntry(left: GridEntry, right: GridEntry): boolean {
  if (left.kind === 'devices' && right.kind === 'devices') return sameRow(left.row, right.row);
  return (
    left.kind === 'lights' &&
    right.kind === 'lights' &&
    left.devices.length === right.devices.length &&
    left.devices.every((device, index) => device === right.devices[index])
  );
}

interface DeviceGridProps {
  readonly groups: readonly RoomGroup<Device>[];
  readonly allDevices: readonly Device[];
  readonly header: ReactElement;
  readonly empty: ReactElement;
}

function Grid({
  groups,
  allDevices,
  header,
  empty,
  width,
}: DeviceGridProps & { readonly width: number }): ReactNode {
  const cell = useCellSize();
  const weights = cardWeightsOf(groups.flatMap((group) => group.devices));
  const columns = columnsFor(width - GUTTERS, cell.gap, cell.minimum);
  return (
    <VirtualList
      sections={sectionsOf(groups, allDevices, columns, weights)}
      keyOf={(row) => row.key}
      widthClassName="max-w-dashboard"
      windowSize={WINDOW_SIZE}
      initialNumToRender={INITIAL_ROWS}
      sameItem={sameEntry}
      header={header}
      empty={empty}
      renderItem={(entry) =>
        entry.kind === 'lights' ? (
          <View className="pb-3">
            <DeviceGroupCard title="All lights" devices={entry.devices} />
          </View>
        ) : (
          <GridRowView row={entry.row} cell={cell} />
        )
      }
    />
  );
}

export function DeviceGrid(props: DeviceGridProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth(Math.round);
  return (
    <View className="flex-1" onLayout={onLayout}>
      {width === 0 ? null : <Grid {...props} width={width} />}
    </View>
  );
}
