import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { G } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import { useMeasuredWidth } from '../use-measured-width';
import {
  NIGHT_BAR_HEIGHT,
  axisMinute,
  axisShare,
  barsFrameOf,
  clockTickLabel,
  clockTicks,
  columnLabel,
  minuteClock,
  slotsOf,
  windowReadout,
  windowSummary,
  type BarsFrame,
  type BarsSpan,
  type Slot,
  type WindowColumn,
} from './night-bars-model';
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
} from './night-bars-parts';
import {
  Bands,
  Highlight,
  NapMark,
  NightBar,
  Placeholder,
  yOf,
  type Usual,
} from './sleep-window-marks';

export type { BarsSpan, WindowColumn, WindowNap, WindowNight } from './night-bars-model';

export interface SleepWindowBarsProps {
  readonly columns: readonly WindowColumn[];
  readonly span: BarsSpan;
  readonly usual: Usual | null;
  readonly label: string;
  readonly height?: number;
}

interface PlotProps {
  readonly frame: BarsFrame;
  readonly span: BarsSpan;
  readonly slots: readonly Slot[];
  readonly columns: readonly WindowColumn[];
  readonly usual: SleepWindowBarsProps['usual'];
  readonly current: number | null;
}

function Columns({ frame, span, slots, columns, usual, current }: PlotProps): ReactNode {
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
            {column.night === null ? (
              usual === null ? null : (
                <Placeholder frame={frame} slot={slot} usual={usual} />
              )
            ) : (
              <NightBar frame={frame} slot={slot} column={column} />
            )}
            <NapMark frame={frame} slot={slot} column={column} dense={span !== 'week'} />
          </G>
        );
      })}
    </G>
  );
}

function Guides({ frame }: { readonly frame: BarsFrame }): ReactNode {
  return (
    <G>
      {clockTicks().map((tick) => (
        <GuideLine key={tick} frame={frame} y={yOf(frame, axisShare(tick))} />
      ))}
    </G>
  );
}

function UsualLines({
  frame,
  usual,
}: {
  readonly frame: BarsFrame;
  readonly usual: Usual;
}): ReactNode {
  return (
    <G>
      {[usual.bed, usual.wake].map((minute) => (
        <ReferenceLine
          key={minute}
          frame={frame}
          y={yOf(frame, axisShare(axisMinute(minute, 'top')))}
          dashed
          opacity={0.55}
        />
      ))}
    </G>
  );
}

function Gutters({ frame }: { readonly frame: BarsFrame }): ReactNode {
  return clockTicks().map((tick) => (
    <GutterText
      key={tick}
      left={0}
      top={yOf(frame, axisShare(tick)) - 8}
      width={frame.left - 6}
      align="end"
      text={clockTickLabel(tick)}
    />
  ));
}

function UsualLabels({
  frame,
  usual,
}: {
  readonly frame: BarsFrame;
  readonly usual: Usual;
}): ReactNode {
  return [usual.bed, usual.wake].map((minute) => (
    <RightLabel
      key={minute}
      frame={frame}
      y={yOf(frame, axisShare(axisMinute(minute, 'top'))) - 16}
      lines={[
        { text: 'Usual', tone: 'variant' },
        { text: minuteClock(minute), tone: 'variant' },
      ]}
    />
  ));
}

function NapLegend({ columns }: { readonly columns: readonly WindowColumn[] }): ReactNode {
  const stroke = useColour('on-surface');
  const fill = useColour('surface-1');
  if (!columns.some((column) => column.nap !== null)) {
    return null;
  }
  const paint = { borderColor: stroke, backgroundColor: fill };
  return (
    <LegendRow
      items={[
        {
          label: 'Nap',
          swatch: <View style={paint} className="size-2.5 rounded-sm border" />,
        },
      ]}
    />
  );
}

interface BodyProps extends SleepWindowBarsProps {
  readonly frame: BarsFrame;
  readonly wide: boolean;
}

function Body({ columns, span, usual, label, frame, wide }: BodyProps): ReactNode {
  const [current, setCurrent] = useState<number | null>(null);
  const slots = slotsOf(span, columns.length, frame.left, frame.right);
  const labels = columns.map((column) => columnLabel(span, column.at, !wide));
  const active = current === null ? undefined : columns[current];
  const centre = current === null ? undefined : slots[current];
  const readout = active === undefined ? null : windowReadout(span, active);
  return (
    <ScrubSurface
      count={columns.length}
      frame={frame}
      current={current}
      set={setCurrent}
      summary={windowSummary(label, span, columns, usual)}
      readoutText={readout === null ? null : readout.text}
    >
      <PlotLayer frame={frame}>
        <Guides frame={frame} />
        {usual === null ? null : <Bands frame={frame} usual={usual} />}
        {usual === null ? null : <UsualLines frame={frame} usual={usual} />}
        <Columns
          frame={frame}
          span={span}
          slots={slots}
          columns={columns}
          usual={usual}
          current={current}
        />
      </PlotLayer>
      <Gutters frame={frame} />
      {usual === null ? null : <UsualLabels frame={frame} usual={usual} />}
      <ColumnLabels frame={frame} span={span} slots={slots} labels={labels} current={current} />
      {readout === null || centre === undefined ? null : (
        <Cursor frame={frame} centre={centre.centre} readout={readout} />
      )}
    </ScrubSurface>
  );
}

export const SleepWindowBars = memo(function SleepWindowBars(
  props: SleepWindowBarsProps,
): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const wide = useIdiom() === 'pointer';
  const height = props.height ?? NIGHT_BAR_HEIGHT;
  const frame = barsFrameOf({ width, height, span: props.span, wide });
  const box = { height };
  return (
    <View className="gap-2">
      <NapLegend columns={props.columns} />
      <View className="w-full" style={box} onLayout={onLayout}>
        {width === 0 ? null : <Body {...props} frame={frame} wide={wide} />}
      </View>
    </View>
  );
});
