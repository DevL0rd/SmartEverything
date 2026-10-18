import { memo, useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { View, useWindowDimensions, type ViewStyle } from 'react-native';
import type { Href } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { WidgetFrameBox } from '../../../components/widget-board';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import {
  VirtualList,
  type ScrollSettled,
  type VirtualSection,
} from '../../../components/virtual-list';
import { LogTally } from '../../../design/log-tally';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { GUTTER, SEMANTIC_SIZES, type Idiom } from '../../../design/tokens';
import { LightGroupCard } from '../../device-groups';
import { plural } from '../../../format/text';
import { NO_ROOM, type DeviceSection, type LightsCard } from '../model/device-filter';
import { columnsFor, contentWidth } from '../model/grid-columns';
import { packRows, sameRow, type PackedRow } from '../model/row-pack';
import { DeviceCell } from './device-cell';

const log = new Logger('app.device-list');
const mounts = new LogTally(log, 'grid.rows_summarised', 5000);

const CELL_HEIGHT: Readonly<Record<Idiom, number>> = { pointer: 196, touch: 220 };

type GridEntry =
  | {
      readonly kind: 'lights';
      readonly key: string;
      readonly card: LightsCard;
      readonly link: Href | undefined;
    }
  | { readonly kind: 'devices'; readonly key: string; readonly row: PackedRow };

function sectionsOf(
  groups: readonly DeviceSection[],
  perRow: number,
): readonly VirtualSection<GridEntry>[] {
  return groups.map((group) => ({
    key: group.key,
    title: `${group.title} · ${plural(group.count, 'device')}`,
    data: [
      ...(group.lights === null
        ? []
        : [
            {
              kind: 'lights' as const,
              key: `${group.key}:lights`,
              card: group.lights,
              link: group.key === NO_ROOM ? undefined : href.roomLights(group.key),
            },
          ]),
      ...packRows(group.devices, perRow).map((row) => ({
        kind: 'devices' as const,
        key: `${group.key}:${row.key}`,
        row,
      })),
    ],
  }));
}

interface CellSize {
  readonly gap: number;
  readonly height: number;
  readonly gutter: number;
  readonly idiom: Idiom;
  readonly pad: number;
  readonly perRow: number;
  readonly column: number;
}

function useCellSize(): CellSize {
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

const GridRowView = memo(
  GridRow,
  (left, right) =>
    left.cell.gap === right.cell.gap &&
    left.cell.height === right.cell.height &&
    left.cell.column === right.cell.column &&
    left.cell.perRow === right.cell.perRow &&
    left.cell.idiom === right.cell.idiom &&
    sameRow(left.row, right.row),
);

function sameEntry(left: GridEntry, right: GridEntry): boolean {
  if (left.kind === 'devices' && right.kind === 'devices') return sameRow(left.row, right.row);
  return (
    left.kind === 'lights' &&
    right.kind === 'lights' &&
    left.card.devices.length === right.card.devices.length &&
    left.card.devices.every((device, index) => device === right.card.devices[index])
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

interface DeviceGridProps {
  readonly groups: readonly DeviceSection[];
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
  header,
  empty,
  width,
}: DeviceGridProps & { readonly width: number }): ReactNode {
  const base = useCellSize();
  const content = contentWidth(width, base.gutter);
  const perRow = columnsFor(content, base.gap);
  const cell = { ...base, perRow, column: (content + base.gap) / perRow - base.gap };
  const sections = useMemo(() => sectionsOf(groups, perRow), [groups, perRow]);
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
      renderItem={(entry) =>
        entry.kind === 'lights' ? (
          <LightsRow entry={entry} width={content} />
        ) : (
          <GridRowView row={entry.row} cell={cell} />
        )
      }
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
