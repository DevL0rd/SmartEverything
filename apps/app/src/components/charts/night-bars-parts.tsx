import type { ReactNode } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Line } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import type { ColourRole } from '../../design/tokens';
import { Text } from '../text';
import { Crosshair, Readout, scrubGesture, type ScrubModel } from './chart-parts';
import { useStepKeys, type StepKeys } from './use-step-keys';
import { STAGE_COLOURS } from './hypnogram-model';
import {
  columnAt,
  stepColumn,
  type BarsFrame,
  type BarsSpan,
  type ColumnReadout,
  type ColumnLabel,
  type Slot,
} from './night-bars-model';

const LABEL_W = 44;
const GUIDE_OPACITY = 0.08;
const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

export function useColumnScrub(
  count: number,
  frame: BarsFrame,
  current: number | null,
  set: (at: number | null) => void,
): {
  readonly gesture: ReturnType<typeof scrubGesture> | ReturnType<typeof Gesture.Race>;
  readonly onAction: (event: AccessibilityActionEvent) => void;
  readonly keys: StepKeys;
} {
  const pointer = useIdiom() === 'pointer';
  const scrub = scrubGesture(pointer, (point) => {
    if (point !== null) {
      set(columnAt(count, frame.left, frame.right, point.x));
    } else if (pointer) {
      set(null);
    }
  });
  const clear = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      set(null);
    });
  const step = (direction: 1 | -1): void => {
    set(stepColumn(count, current, direction));
  };
  const keys = useStepKeys(step, () => {
    set(null);
  });
  return {
    gesture: pointer ? scrub : Gesture.Race(scrub, clear),
    onAction: (event): void => {
      const name = event.nativeEvent.actionName;
      if (name === 'increment' || name === 'decrement') {
        step(name === 'increment' ? 1 : -1);
      }
    },
    keys,
  };
}

export interface ScrubSurfaceProps {
  readonly count: number;
  readonly frame: BarsFrame;
  readonly current: number | null;
  readonly set: (at: number | null) => void;
  readonly summary: string;
  readonly readoutText: string | null;
  readonly children: ReactNode;
}

export function ScrubSurface({
  count,
  frame,
  current,
  set,
  summary,
  readoutText,
  children,
}: ScrubSurfaceProps): ReactNode {
  const { gesture, onAction, keys } = useColumnScrub(count, frame, current, set);
  const box = { height: frame.height };
  const value = readoutText === null ? {} : { accessibilityValue: { text: readoutText } };
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        {...keys}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={onAction}
        accessibilityLabel={summary}
        accessibilityHint="Swipe up or down to move through the columns."
        {...value}
        style={box}
        className="relative w-full"
      >
        {children}
      </View>
    </GestureDetector>
  );
}

export function PlotLayer({
  frame,
  children,
}: {
  readonly frame: BarsFrame;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width={frame.width} height={frame.height}>
        {children}
      </Svg>
    </View>
  );
}

export function GuideLine({
  frame,
  y,
}: {
  readonly frame: BarsFrame;
  readonly y: number;
}): ReactNode {
  const stroke = useColour('on-surface');
  return (
    <Line
      x1={frame.left}
      x2={frame.right}
      y1={y}
      y2={y}
      stroke={stroke}
      strokeOpacity={GUIDE_OPACITY}
      strokeWidth={1}
    />
  );
}

export function ReferenceLine({
  frame,
  y,
  dashed,
  opacity,
}: {
  readonly frame: BarsFrame;
  readonly y: number;
  readonly dashed: boolean;
  readonly opacity: number;
}): ReactNode {
  const stroke = useColour('on-surface');
  return (
    <Line
      x1={frame.left}
      x2={frame.right}
      y1={y}
      y2={y}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={1}
      {...(dashed ? { strokeDasharray: '5 4' } : {})}
    />
  );
}

export function GutterText({
  left,
  top,
  width,
  align,
  text,
  tone = 'variant',
}: {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly align: 'start' | 'end' | 'center';
  readonly text: string;
  readonly tone?: 'faint' | 'variant';
}): ReactNode {
  const place = { left, top, width };
  return (
    <View pointerEvents="none" style={place} className="absolute" aria-hidden>
      <Text variant="caption" tone={tone} align={align} numberOfLines={1} className="tabular">
        {text}
      </Text>
    </View>
  );
}

export function RightLabel({
  frame,
  y,
  lines,
}: {
  readonly frame: BarsFrame;
  readonly y: number;
  readonly lines: readonly { readonly text: string; readonly tone: 'faint' | 'variant' }[];
}): ReactNode {
  const place = { left: frame.right + 6, top: y, width: frame.width - frame.right - 6 };
  return (
    <View pointerEvents="none" style={place} className="absolute" aria-hidden>
      {lines.map((line) => (
        <Text
          key={line.text}
          variant="caption"
          tone={line.tone}
          numberOfLines={1}
          className="tabular"
        >
          {line.text}
        </Text>
      ))}
    </View>
  );
}

function ColumnText({
  frame,
  span,
  slot,
  label,
  active,
}: {
  readonly frame: BarsFrame;
  readonly span: BarsSpan;
  readonly slot: Slot;
  readonly label: ColumnLabel;
  readonly active: boolean;
}): ReactNode {
  const left = Math.min(frame.width - LABEL_W, Math.max(0, slot.centre - LABEL_W / 2));
  const place = { left, top: frame.top + frame.plotHeight + 4, width: LABEL_W };
  return (
    <View pointerEvents="none" style={place} className="absolute items-center" aria-hidden>
      <Text variant="caption" tone="variant" align="center" numberOfLines={1}>
        {label.primary}
      </Text>
      {span === 'week' ? (
        <Text
          variant="caption"
          tone={active ? 'default' : 'variant'}
          align="center"
          numberOfLines={1}
          className="tabular"
        >
          {label.secondary}
        </Text>
      ) : null}
    </View>
  );
}

export function ColumnLabels({
  frame,
  span,
  slots,
  labels,
  current,
}: {
  readonly frame: BarsFrame;
  readonly span: BarsSpan;
  readonly slots: readonly Slot[];
  readonly labels: readonly ColumnLabel[];
  readonly current: number | null;
}): ReactNode {
  return slots.map((slot, index) => {
    const label = labels[index];
    if (label === undefined || (label.primary === '' && label.secondary === '')) {
      return null;
    }
    return (
      <ColumnText
        key={`label-${String(index)}`}
        frame={frame}
        span={span}
        slot={slot}
        label={label}
        active={index === current}
      />
    );
  });
}

export function Cursor({
  frame,
  centre,
  readout,
}: {
  readonly frame: BarsFrame;
  readonly centre: number;
  readonly readout: ColumnReadout;
}): ReactNode {
  const model: ScrubModel = {
    box: {
      width: frame.width,
      height: frame.plotHeight,
      left: frame.left,
      right: frame.right,
      top: frame.top,
      bottom: frame.top + frame.plotHeight,
    },
    x: (at) => at,
  };
  const values = new Map(readout.rows.map((row) => [row.label, row.value]));
  const hits = readout.rows.map((row) => ({
    series: {
      points: [],
      colour: roleOf(row.stage),
      label: row.label,
    },
    point: { t: centre, v: 0 },
  }));
  return (
    <>
      <PlotLayer frame={frame}>
        <Crosshair hits={hits} model={model} />
      </PlotLayer>
      <Readout
        hits={hits}
        model={model}
        heading={readout.heading}
        valueOf={(hit) => values.get(hit.series.label) ?? ''}
      />
    </>
  );
}

function roleOf(stage: ColumnReadout['rows'][number]['stage']): ColourRole {
  return stage === null ? 'on-surface-faint' : STAGE_COLOURS[stage];
}

export function Swatch({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = useColour(colour);
  const paint = { backgroundColor: fill };
  return <View style={paint} className="size-2.5 rounded-sm" />;
}

export function LegendRow({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly swatch: ReactNode }[];
}): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          {item.swatch}
          <Text variant="footnote" tone="variant">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
