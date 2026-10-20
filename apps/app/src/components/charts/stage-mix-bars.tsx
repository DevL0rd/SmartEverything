import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { G, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import { useMeasuredWidth } from '../use-measured-width';
import { STAGE_COLOURS, STAGE_NAMES } from './hypnogram-model';
import {
  NIGHT_BAR_HEIGHT,
  barsFrameOf,
  columnLabel,
  rectPath,
  slotsOf,
  type BarsFrame,
  type BarsSpan,
  type Slot,
} from './night-bars-model';
import {
  goalText,
  hasUnstaged,
  lineSides,
  mixDomain,
  mixReadout,
  mixShare,
  mixSummary,
  stackOf,
  tickText,
  type MixColumn,
  type MixDomain,
  type StackSegment,
} from './stage-mix-model';
import {
  ColumnLabels,
  Cursor,
  GuideLine,
  GutterText,
  LegendRow,
  PlotLayer,
  ReferenceLine,
  RightLabel,
  ScrubSurface,
  Swatch,
} from './night-bars-parts';
import { hoursMinutes } from '../../format/time';

export type { MixColumn, MixNight, MixStages } from './stage-mix-model';

export interface StageMixBarsProps {
  readonly columns: readonly MixColumn[];
  readonly span: BarsSpan;
  readonly goal: number;
  readonly average: number | null;
  readonly label: string;
  readonly height?: number;
}

const BAR_RADIUS = 4;
const HIGHLIGHT_OPACITY = 0.08;
const GOAL_OPACITY = 0.55;
const AVERAGE_OPACITY = 0.4;
const MARK_W = 20;

function yOf(frame: BarsFrame, domain: MixDomain, minutes: number): number {
  return frame.top + frame.plotHeight - mixShare(domain, minutes) * frame.plotHeight;
}

function Segment({
  frame,
  slot,
  segment,
}: {
  readonly frame: BarsFrame;
  readonly slot: Slot;
  readonly segment: StackSegment;
}): ReactNode {
  const fill = useColour(STAGE_COLOURS[segment.stage]);
  const top = frame.top + segment.top;
  const bottom = Math.max(frame.top + segment.bottom, top + 1);
  const radius = segment.capped ? Math.min(BAR_RADIUS, slot.width / 2) : 0;
  return (
    <Path
      d={rectPath({ x: slot.centre - slot.width / 2, width: slot.width, top, bottom }, radius)}
      fill={fill}
    />
  );
}

function Highlight({
  frame,
  slot,
  slotWidth,
}: {
  readonly frame: BarsFrame;
  readonly slot: Slot;
  readonly slotWidth: number;
}): ReactNode {
  const fill = useColour('on-surface');
  return (
    <Path
      d={rectPath({
        x: slot.centre - slotWidth / 2,
        width: slotWidth,
        top: frame.top,
        bottom: frame.top + frame.plotHeight,
      })}
      fill={fill}
      fillOpacity={HIGHLIGHT_OPACITY}
    />
  );
}

interface ColumnsProps {
  readonly frame: BarsFrame;
  readonly domain: MixDomain;
  readonly slots: readonly Slot[];
  readonly columns: readonly MixColumn[];
  readonly current: number | null;
}

function Columns({ frame, domain, slots, columns, current }: ColumnsProps): ReactNode {
  const slotWidth = slots.length === 0 ? 0 : (frame.right - frame.left) / slots.length;
  return (
    <G>
      {columns.map((column, index) => {
        const slot = slots[index];
        if (slot === undefined) {
          return null;
        }
        return (
          <G key={column.key}>
            {index === current ? (
              <Highlight frame={frame} slot={slot} slotWidth={slotWidth} />
            ) : null}
            {column.night === null
              ? null
              : stackOf(column.night, domain, frame.plotHeight).map((segment) => (
                  <Segment key={segment.stage} frame={frame} slot={slot} segment={segment} />
                ))}
          </G>
        );
      })}
    </G>
  );
}

function Missing({
  frame,
  slots,
  columns,
}: {
  readonly frame: BarsFrame;
  readonly slots: readonly Slot[];
  readonly columns: readonly MixColumn[];
}): ReactNode {
  return columns.map((column, index) => {
    const slot = slots[index];
    if (column.night !== null || slot === undefined) {
      return null;
    }
    return (
      <GutterText
        key={column.key}
        left={slot.centre - MARK_W / 2}
        top={frame.top + frame.plotHeight - 14}
        width={MARK_W}
        align="center"
        text="–"
      />
    );
  });
}

function TickLabels({
  frame,
  domain,
}: {
  readonly frame: BarsFrame;
  readonly domain: MixDomain;
}): ReactNode {
  return domain.ticks.map((tick) => (
    <GutterText
      key={tick}
      left={0}
      top={yOf(frame, domain, tick) - 8}
      width={frame.left - 6}
      align="end"
      text={tickText(tick)}
    />
  ));
}

function ReferenceLabels({
  frame,
  domain,
  goal,
  average,
}: {
  readonly frame: BarsFrame;
  readonly domain: MixDomain;
  readonly goal: number;
  readonly average: number | null;
}): ReactNode {
  const goalY = yOf(frame, domain, goal);
  const averageY = average === null ? goalY + 1 : yOf(frame, domain, average);
  const sides = lineSides(goalY, averageY);
  const place = (y: number, side: 'above' | 'below'): number => (side === 'above' ? y - 16 : y + 1);
  return (
    <>
      <RightLabel
        frame={frame}
        y={place(goalY, sides.first)}
        lines={[{ text: `Goal ${goalText(goal)}`, tone: 'variant' }]}
      />
      {average === null ? null : (
        <RightLabel
          frame={frame}
          y={place(averageY, sides.second)}
          lines={[{ text: `Avg ${hoursMinutes(average)}`, tone: 'variant' }]}
        />
      )}
    </>
  );
}

function Legend({ columns }: { readonly columns: readonly MixColumn[] }): ReactNode {
  const stages = (['deep', 'light', 'rem'] as const).map((stage) => ({
    label: STAGE_NAMES[stage],
    swatch: <Swatch colour={STAGE_COLOURS[stage]} />,
  }));
  const asleep = hasUnstaged(columns)
    ? [{ label: STAGE_NAMES.asleep, swatch: <Swatch colour={STAGE_COLOURS.asleep} /> }]
    : [];
  return <LegendRow items={[...stages, ...asleep]} />;
}

interface BodyProps extends StageMixBarsProps {
  readonly frame: BarsFrame;
  readonly wide: boolean;
}

function Body({ columns, span, goal, average, label, frame, wide }: BodyProps): ReactNode {
  const [current, setCurrent] = useState<number | null>(null);
  const domain = mixDomain(columns, average === null ? [goal] : [goal, average]);
  const slots = slotsOf(span, columns.length, frame.left, frame.right);
  const labels = columns.map((column) => columnLabel(span, column.at, !wide));
  const active = current === null ? undefined : columns[current];
  const centre = current === null ? undefined : slots[current];
  const readout = active === undefined ? null : mixReadout(span, active);
  return (
    <ScrubSurface
      count={columns.length}
      frame={frame}
      current={current}
      set={setCurrent}
      summary={mixSummary(label, span, columns, { goal, average })}
      readoutText={readout === null ? null : readout.text}
    >
      <PlotLayer frame={frame}>
        {domain.ticks.map((tick) => (
          <GuideLine key={tick} frame={frame} y={yOf(frame, domain, tick)} />
        ))}
        <Columns frame={frame} domain={domain} slots={slots} columns={columns} current={current} />
        <ReferenceLine frame={frame} y={yOf(frame, domain, goal)} dashed opacity={GOAL_OPACITY} />
        {average === null ? null : (
          <ReferenceLine
            frame={frame}
            y={yOf(frame, domain, average)}
            dashed={false}
            opacity={AVERAGE_OPACITY}
          />
        )}
      </PlotLayer>
      <TickLabels frame={frame} domain={domain} />
      <ReferenceLabels frame={frame} domain={domain} goal={goal} average={average} />
      <Missing frame={frame} slots={slots} columns={columns} />
      <ColumnLabels frame={frame} span={span} slots={slots} labels={labels} current={current} />
      {readout === null || centre === undefined ? null : (
        <Cursor frame={frame} centre={centre.centre} readout={readout} />
      )}
    </ScrubSurface>
  );
}

export const StageMixBars = memo(function StageMixBars(props: StageMixBarsProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const wide = useIdiom() === 'pointer';
  const height = props.height ?? NIGHT_BAR_HEIGHT;
  const frame = barsFrameOf({ width, height, span: props.span, wide });
  const box = { height };
  return (
    <View className="gap-2">
      <Legend columns={props.columns} />
      <View className="w-full" style={box} onLayout={onLayout}>
        {width === 0 ? null : <Body {...props} frame={frame} wide={wide} />}
      </View>
    </View>
  );
});
