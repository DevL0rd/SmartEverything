import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { cn } from '../../../design/cn';
import {
  TEXT_PILL_FROM,
  alarmClustersOf,
  laneInsetOf,
  pillBandOf,
  type AlarmCluster,
  type PillBand,
} from './alarm-clusters';
import { AlarmPills, PinLines, pillWidthOf } from './alarm-pin';
import { SlotLayer, type Slot, type SlotRange } from './drag-create';
import { EventBlock, blockBandOf } from './event-block';
import type { BlockChange, BlockDragContext } from './grid-gestures';
import type { Geometry } from './grid-frame';
import {
  MIN_BLOCK_HEIGHT,
  bandStyle,
  type AlarmPin as Pin,
  type GridDay,
  type MinuteBand,
} from './time-grid-layout';

function Tint({
  band,
  hourHeight,
  className,
}: {
  readonly band: MinuteBand;
  readonly hourHeight: number;
  readonly className: string;
}): ReactNode {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={bandStyle(band.from, band.to, hourHeight)}
      className={cn('absolute inset-x-0', className)}
    />
  );
}

function Tints({
  day,
  hourHeight,
}: {
  readonly day: GridDay;
  readonly hourHeight: number;
}): ReactNode {
  return (
    <>
      {day.working === null ? null : (
        <Tint band={day.working} hourHeight={hourHeight} className="bg-primary/7" />
      )}
      {day.sleep.map((band) => (
        <Tint
          key={`${String(band.from)}-${String(band.to)}`}
          band={band}
          hourHeight={hourHeight}
          className="bg-sleep-band/25"
        />
      ))}
    </>
  );
}

export interface Drafting {
  readonly draft: SlotRange | null;
  readonly onDraft: (draft: SlotRange | null) => void;
  readonly onCreate: (draft: SlotRange) => void;
  readonly onSlot: (slot: Slot) => void;
}

interface ColumnProps {
  readonly day: GridDay;
  readonly index: number;
  readonly count: number;
  readonly pins: readonly Pin[];
  readonly geometry: Geometry;
  readonly height: SharedValue<number>;
  readonly drafting: Drafting;
  readonly revision: number;
  readonly onMove: (change: BlockChange) => void;
}

type PillWidths = ReadonlyMap<string, number>;

function withWidth(widths: PillWidths, key: string, width: number): PillWidths {
  return widths.get(key) === width ? widths : new Map(widths).set(key, width);
}

interface AlarmLane {
  readonly clusters: readonly AlarmCluster[];
  readonly bands: readonly PillBand[];
  readonly text: boolean;
  readonly onWidth: (key: string, width: number) => void;
}

function useAlarmLane(pins: readonly Pin[], hourHeight: number, width: number): AlarmLane {
  const [pills, setPills] = useState<PillWidths>(new Map());
  const text = width >= TEXT_PILL_FROM;
  const clusters = alarmClustersOf(pins, hourHeight);
  return {
    clusters,
    text,
    bands: clusters.map((cluster) =>
      pillBandOf(cluster, hourHeight, pillWidthOf(text, pills, cluster.key)),
    ),
    onWidth: (key, measured): void => {
      setPills((current) => withWidth(current, key, measured));
    },
  };
}

function Blocks({
  day,
  context,
  hourHeight,
  bands,
  revision,
}: {
  readonly day: GridDay;
  readonly context: BlockDragContext;
  readonly hourHeight: number;
  readonly bands: readonly PillBand[];
  readonly revision: number;
}): ReactNode {
  return day.blocks.map((block) => (
    <EventBlock
      key={`${block.key}:${String(revision)}`}
      block={block}
      context={context}
      hourHeight={hourHeight}
      inset={laneInsetOf(
        {
          ...blockBandOf(block, hourHeight, MIN_BLOCK_HEIGHT),
          left: (context.columnWidth * block.lane) / block.lanes,
          width: (context.columnWidth * block.width) / block.lanes,
        },
        bands,
      )}
    />
  ));
}

function contextOf(props: ColumnProps, width: number): BlockDragContext {
  return {
    date: props.day.date,
    hourHeight: props.height,
    minHeight: MIN_BLOCK_HEIGHT,
    columnWidth: width,
    dayIndex: props.index,
    dayCount: props.count,
    touch: props.geometry.compact,
    onChange: props.onMove,
  };
}

export function DayColumn(props: ColumnProps): ReactNode {
  const { day, pins, geometry, height, drafting, revision } = props;
  const { hourHeight, compact } = geometry;
  const [width, setWidth] = useState(0);
  const lane = useAlarmLane(pins, hourHeight, width);
  const context = contextOf(props, width);
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      className="relative flex-1 border-l border-outline-variant"
    >
      <SlotLayer
        date={day.date}
        hourHeight={height}
        minHeight={MIN_BLOCK_HEIGHT}
        touch={compact}
        {...drafting}
      />
      <Tints day={day} hourHeight={hourHeight} />
      <PinLines pins={pins} hourHeight={hourHeight} />
      <AlarmPills
        clusters={lane.clusters}
        hourHeight={hourHeight}
        text={lane.text}
        onWidth={lane.onWidth}
      />
      <Blocks
        day={day}
        context={context}
        hourHeight={hourHeight}
        bands={lane.bands}
        revision={revision}
      />
    </View>
  );
}
