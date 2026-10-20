import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { Href } from 'expo-router';
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
import { LightGroupCard } from '../../device-groups';
import { cn } from '../../../design/cn';
import { NO_ROOM, type DeviceSection, type LightsCard } from '../model/device-filter';
import { columnsFor, contentWidth } from '../model/grid-columns';
import { BAND_INSET } from '../model/room-band';
import { packRows, sameRow, type PackedRow } from '../model/row-pack';
import { GridRowView, useCellSize, type CellSize } from './grid-row';
import { RoomHeader, type RoomHeaderEntry } from './room-header';

const log = new Logger('app.device-list');

type GridEntry =
  | { readonly kind: 'room'; readonly key: string; readonly room: RoomHeaderEntry }
  | {
      readonly kind: 'lights';
      readonly key: string;
      readonly card: LightsCard;
      readonly link: Href | undefined;
      readonly last: boolean;
    }
  | {
      readonly kind: 'devices';
      readonly key: string;
      readonly row: PackedRow;
      readonly last: boolean;
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
            alone: body.length === 0,
          },
        },
        ...body,
      ],
    };
  });
}

function sameRoomEntry(left: RoomHeaderEntry, right: RoomHeaderEntry): boolean {
  return (
    left.title === right.title &&
    left.count === right.count &&
    left.status === right.status &&
    left.alone === right.alone
  );
}

function sameEntry(left: GridEntry, right: GridEntry): boolean {
  switch (left.kind) {
    case 'room':
      return right.kind === 'room' && sameRoomEntry(left.room, right.room);
    case 'devices':
      return right.kind === 'devices' && left.last === right.last && sameRow(left.row, right.row);
    case 'lights':
      return (
        right.kind === 'lights' &&
        left.last === right.last &&
        left.card.devices.length === right.card.devices.length &&
        left.card.devices.every((device, index) => device === right.card.devices[index])
      );
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

function LightsRow({
  entry,
  width,
}: {
  readonly entry: LightsEntry;
  readonly width: number;
}): ReactNode {
  return (
    <View className="pb-3">
      <LightGroupCard
        target={entry.card.target}
        rows="capped"
        availableWidth={width}
        title={`Lights · ${String(entry.card.devices.length)}`}
        {...(entry.link === undefined ? {} : { href: entry.link })}
      />
    </View>
  );
}

function renderEntry(entry: GridEntry, width: number, cell: CellSize): ReactElement {
  if (entry.kind === 'room') return <RoomHeader entry={entry.room} />;
  return (
    <Band last={entry.last}>
      {entry.kind === 'lights' ? (
        <LightsRow entry={entry} width={width} />
      ) : (
        <GridRowView row={entry.row} cell={cell} />
      )}
    </Band>
  );
}

interface DeviceGridProps {
  readonly groups: readonly DeviceSection[];
  readonly status: boolean;
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
}

function Grid({
  groups,
  status,
  header,
  empty,
  width,
}: DeviceGridProps & { readonly width: number }): ReactNode {
  const base = useCellSize();
  const content = contentWidth(width, base.gutter);
  const inner = content - BAND_INSET;
  const perRow = columnsFor(inner, base.gap);
  const cell = { ...base, perRow, column: (inner + base.gap) / perRow - base.gap };
  const sections = useMemo(() => sectionsOf(groups, perRow, status), [groups, perRow, status]);
  useGridLog({ width, columns: perRow, cell, sections, groups });
  return (
    <VirtualList
      sections={sections}
      keyOf={(row) => row.key}
      typeOf={(row) => row.kind}
      widthClassName="max-w-dashboard"
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
