import { memo, useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { AppHref } from '../../../components/app-href';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import {
  VirtualList,
  type ScrollSettled,
  type VirtualSection,
} from '../../../components/virtual-list';
import { useIdiom } from '../../../design/platform';
import { CONTAINER_WIDTH, type Idiom } from '../../../design/tokens';
import { LightGroupCard } from '../../device-groups';
import { ScrollModelLayer } from '../../models';
import { cn } from '../../../design/cn';
import { NO_ROOM, type DeviceSection, type LightsCard } from '../model/device-filter';
import type { Device } from '../../../store/state';
import { columnsFor, contentWidth } from '../model/grid-columns';
import { selectedFillDevice } from '../model/grid-fill';
import { BAND_INSET } from '../model/room-band';
import { packRows, sameRow, type PackedRow } from '../model/row-pack';
import { FilledDeviceCell } from './device-cell';
import { GridRowView, useCellSize, type CellSize } from './grid-row';
import { RoomHeader, type RoomHeaderEntry } from './room-header';

const log = new Logger('app.device-list');

type GridEntry =
  | { readonly kind: 'room'; readonly key: string; readonly room: RoomHeaderEntry }
  | {
      readonly kind: 'lights';
      readonly key: string;
      readonly card: LightsCard;
      readonly link: AppHref | undefined;
      readonly last: boolean;
    }
  | {
      readonly kind: 'devices';
      readonly key: string;
      readonly row: PackedRow;
      readonly last: boolean;
    }
  | {
      readonly kind: 'fill';
      readonly key: string;
      readonly device: Device;
      readonly width: number;
      readonly height: number;
    };

function bodyOf(
  group: DeviceSection,
  perRow: number,
): readonly (GridEntry & { readonly kind: 'lights' | 'devices' })[] {
  const lights = group.lights === null ? [] : [group.lights];
  const rows = packRows(group.devices, perRow);
  const total = lights.length + rows.length;
  return [
    ...lights.map((card) => ({
      kind: 'lights' as const,
      key: `${group.key}:lights`,
      card,
      link: group.key === NO_ROOM ? undefined : href.roomLights(group.key),
      last: total === 1,
    })),
    ...rows.map((row, index) => ({
      kind: 'devices' as const,
      key: `${group.key}:${row.key}`,
      row,
      last: lights.length + index === total - 1,
    })),
  ];
}

function sectionsOf(
  groups: readonly DeviceSection[],
  perRow: number,
  status: boolean,
  selectedRoomId: string | null,
): readonly VirtualSection<GridEntry>[] {
  return groups.map((group) => {
    const body = bodyOf(group, perRow);
    return {
      key: group.key,
      title: null,
      data: [
        {
          kind: 'room' as const,
          key: `${group.key}:room`,
          room: {
            key: group.key,
            title: group.title,
            count: group.count,
            status,
            selected: group.key === selectedRoomId,
            alone: body.length === 0,
          },
        },
        ...body,
      ],
    };
  });
}

function fillSections(
  device: Device,
  width: number,
  height: number,
): readonly VirtualSection<GridEntry>[] {
  return [
    {
      key: 'fill',
      title: null,
      data: [{ kind: 'fill', key: `fill:${device.id}`, device, width, height }],
    },
  ];
}

function sameRoomEntry(left: RoomHeaderEntry, right: RoomHeaderEntry): boolean {
  return (
    left.title === right.title &&
    left.count === right.count &&
    left.status === right.status &&
    left.selected === right.selected &&
    left.alone === right.alone
  );
}

function sameFill(left: FillEntry, right: GridEntry): boolean {
  return (
    right.kind === 'fill' &&
    left.device === right.device &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameLights(left: LightsEntry, right: GridEntry): boolean {
  return (
    right.kind === 'lights' &&
    left.last === right.last &&
    left.card.devices.length === right.card.devices.length &&
    left.card.devices.every((device, index) => device === right.card.devices[index])
  );
}

function sameEntry(left: GridEntry, right: GridEntry): boolean {
  switch (left.kind) {
    case 'room':
      return right.kind === 'room' && sameRoomEntry(left.room, right.room);
    case 'devices':
      return right.kind === 'devices' && left.last === right.last && sameRow(left.row, right.row);
    case 'fill':
      return sameFill(left, right);
    case 'lights':
      return sameLights(left, right);
  }
}

function Band({
  last,
  children,
}: {
  readonly last: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn(
        'border-x border-outline-variant bg-surface-1 px-3',
        last && 'rounded-b-xl border-b pb-2',
      )}
    >
      {children}
    </View>
  );
}

type LightsEntry = Extract<GridEntry, { readonly kind: 'lights' }>;
type FillEntry = Extract<GridEntry, { readonly kind: 'fill' }>;

function LightsRow({
  entry,
  width,
}: {
  readonly entry: LightsEntry;
  readonly width: number;
}): ReactNode {
  const cardWidth = Math.min(width, CONTAINER_WIDTH.dashboard - BAND_INSET);
  const cardStyle = { width: cardWidth };
  return (
    <View className="pb-3" style={cardStyle}>
      <LightGroupCard
        target={entry.card.target}
        rows="capped"
        availableWidth={cardWidth}
        title={`Lights · ${String(entry.card.devices.length)}`}
        {...(entry.link === undefined ? {} : { href: entry.link })}
      />
    </View>
  );
}

interface FillRowProps {
  readonly device: Device;
  readonly width: number;
  readonly height: number;
  readonly pad: number;
  readonly idiom: Idiom;
}

function FillRowView({ device, width, height, pad, idiom }: FillRowProps): ReactNode {
  const frame = useMemo(
    () => ({ width: width - 2 * pad, height: height - 2 * pad, idiom }),
    [width, height, pad, idiom],
  );
  const box = useMemo(() => ({ width, height }), [width, height]);
  return (
    <ScrollModelLayer key={device.id} style={box}>
      <FilledDeviceCell device={device} frame={frame} />
    </ScrollModelLayer>
  );
}

const FillRow = memo(FillRowView);

function renderEntry(entry: GridEntry, width: number, cell: CellSize): ReactElement {
  if (entry.kind === 'room') return <RoomHeader entry={entry.room} />;
  if (entry.kind === 'fill') {
    return (
      <FillRow
        device={entry.device}
        width={entry.width}
        height={entry.height}
        pad={cell.pad}
        idiom={cell.idiom}
      />
    );
  }
  return (
    <Band last={entry.last}>
      {entry.kind === 'lights' ? (
        <ScrollModelLayer key={entry.key}>
          <LightsRow entry={entry} width={width} />
        </ScrollModelLayer>
      ) : (
        <GridRowView row={entry.row} cell={cell} />
      )}
    </Band>
  );
}

interface DeviceGridProps {
  readonly groups: readonly DeviceSection[];
  readonly status: boolean;
  readonly selectedDeviceId: string | null;
  readonly selectedRoomId: string | null;
  readonly header: ReactElement;
  readonly empty: ReactElement;
}

function settled(info: ScrollSettled): void {
  log.debug('grid.scroll_settled', () => ({ ...info }));
}

function useGridLog(shown: {
  readonly width: number;
  readonly columns: number;
  readonly cell: CellSize;
  readonly sections: readonly VirtualSection<GridEntry>[];
  readonly groups: readonly DeviceSection[];
}): void {
  const { width, columns, cell, sections, groups } = shown;
  const rows = sections.reduce((total, section) => total + section.data.length, 0);
  const devices = groups.reduce((total, group) => total + group.devices.length, 0);
  const column = Math.round(cell.column);
  useEffect(() => {
    log.debug('grid.layout_changed', {
      width,
      columns,
      column,
      cellHeight: cell.height,
      gap: cell.gap,
      idiom: cell.idiom,
    });
  }, [width, columns, column, cell.height, cell.gap, cell.idiom]);
  useEffect(() => {
    log.debug('grid.rows_changed', { sections: sections.length, rows, devices, columns });
  }, [sections.length, rows, devices, columns]);
  const fill = sections[0]?.data[0];
  const filled = fill?.kind === 'fill' ? fill.height : null;
  useEffect(() => {
    log.debug('grid.fill_changed', { filled: filled !== null, height: filled ?? 0 });
  }, [filled]);
}

interface GridSpace {
  readonly width: number;
  readonly height: number;
}

function useGridSections(
  groups: readonly DeviceSection[],
  perRow: number,
  status: boolean,
  selection: Pick<DeviceGridProps, 'selectedDeviceId' | 'selectedRoomId'>,
  fill: GridSpace,
): readonly VirtualSection<GridEntry>[] {
  const { selectedDeviceId, selectedRoomId } = selection;
  const lone = selectedFillDevice(groups, selectedDeviceId);
  const { width, height } = fill;
  return useMemo(
    () =>
      lone === null
        ? sectionsOf(groups, perRow, status, selectedRoomId)
        : fillSections(lone, width, height),
    [lone, groups, perRow, status, selectedRoomId, width, height],
  );
}

function Grid({
  groups,
  status,
  header,
  empty,
  width,
  ...selection
}: DeviceGridProps & { readonly width: number }): ReactNode {
  const base = useCellSize();
  const content = contentWidth(width, base.gutter);
  const inner = content - BAND_INSET;
  const perRow = columnsFor(inner, base.gap);
  const cell = { ...base, perRow, column: (inner + base.gap) / perRow - base.gap };
  const fill = {
    width: Math.min(content, CONTAINER_WIDTH.dashboard),
    height: base.fill,
  };
  const sections = useGridSections(groups, perRow, status, selection, fill);
  useGridLog({ width, columns: perRow, cell, sections, groups });
  return (
    <VirtualList
      sections={sections}
      keyOf={(row) => row.key}
      typeOf={(row) => row.kind}
      sameItem={sameEntry}
      probe="devices"
      onScrollSettled={settled}
      header={header}
      empty={empty}
      renderItem={(entry) => renderEntry(entry, inner, cell)}
    />
  );
}

export function DeviceGrid(props: DeviceGridProps): ReactNode {
  useLifecycleLog(log, 'grid');
  const screenWidth = useWindowDimensions().width;
  const { width, onLayout } = useMeasuredWidth(
    Math.round,
    useIdiom() === 'touch' ? Math.round(screenWidth) : 0,
  );
  return (
    <View className="flex-1" onLayout={onLayout}>
      {width === 0 ? null : <Grid {...props} width={width} />}
    </View>
  );
}
