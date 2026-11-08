import type { DriveStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { Card } from '../../../components/card';
import { BarLabels, BarMarks, type BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import { ChartLegend } from '../../../components/charts/chart-legend';
import type { ChartSeries } from '../../../components/charts/chart-model';
import { EmptyGraph } from '../../../components/charts/empty-graph';
import { Text } from '../../../components/text';
import { useDraw } from '../../../components/use-draw';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useColour } from '../../../design/colour';
import { useMotion } from '../../../design/motion';
import type { ColourRole } from '../../../design/tokens';
import { bytes } from '../../../format/number';
import { monthShort, startOfDayKey } from '../../../format/time';

type Purge = DriveStats['purges'][number];

const PLOT_HEIGHT = 96;
const SEGMENT_GAP = 2;
const RADIUS = 3;
const GAP_SHARE = 0.25;
const PLOT_BOX = { height: PLOT_HEIGHT } as const;
const VERSIONS: ColourRole = 'info';
const TRASH: ColourRole = 'track';

export interface PurgeTotals {
  readonly versionBytes: number;
  readonly trashBytes: number;
}

export function purgeTotalsOf(purges: readonly Purge[]): PurgeTotals {
  return purges.reduce(
    (all, purge) => ({
      versionBytes: all.versionBytes + purge.versionBytes,
      trashBytes: all.trashBytes + purge.trashBytes,
    }),
    { versionBytes: 0, trashBytes: 0 },
  );
}

export function monthLabelOf(month: string): string {
  return monthShort(startOfDayKey(`${month}-01`));
}

function monthShapes(
  purge: Purge,
  slot: { readonly x: number; readonly width: number },
  { unit, trashFill }: { readonly unit: number; readonly trashFill: string },
): BarShape[] {
  const base = PLOT_HEIGHT - 1;
  const versionTop = base - purge.versionBytes * unit;
  const shapes: BarShape[] = [];
  if (purge.versionBytes > 0) {
    shapes.push({
      key: `${purge.month}-versions`,
      ...slot,
      top: Math.min(base - 1, versionTop),
      bottom: base,
      radii: { top: purge.trashBytes > 0 ? 0 : RADIUS, bottom: 0 },
      opacity: 1,
    });
  }
  if (purge.trashBytes > 0) {
    const bottom = purge.versionBytes > 0 ? versionTop - SEGMENT_GAP : base;
    shapes.push({
      key: `${purge.month}-trash`,
      ...slot,
      top: Math.min(bottom - 1, bottom - purge.trashBytes * unit),
      bottom,
      radii: { top: RADIUS, bottom: 0 },
      opacity: 1,
      fill: trashFill,
    });
  }
  return shapes;
}

export function purgeShapesOf(
  purges: readonly Purge[],
  width: number,
  trashFill: string,
): BarShape[] {
  const peak = Math.max(1, ...purges.map((purge) => purge.versionBytes + purge.trashBytes));
  const stacked = purges.some((purge) => purge.versionBytes > 0 && purge.trashBytes > 0);
  const unit = (PLOT_HEIGHT - 1 - (stacked ? SEGMENT_GAP : 0)) / peak;
  const slots = barSlots(purges.length, width, { gap: GAP_SHARE, min: 1 });
  return purges.flatMap((purge, index) => {
    const slot = slots[index];
    return slot === undefined ? [] : monthShapes(purge, slot, { unit, trashFill });
  });
}

export function purgeSummaryOf(purges: readonly Purge[]): string {
  const totals = purgeTotalsOf(purges);
  const first = purges[0];
  const last = purges.at(-1);
  const span =
    first === undefined || last === undefined
      ? ''
      : ` from ${monthLabelOf(first.month)} to ${monthLabelOf(last.month)}`;
  return `Space that frees up each month${span}: old versions ${bytes(totals.versionBytes)}, trash ${bytes(totals.trashBytes)}`;
}

function Reveal({
  grow,
  children,
}: {
  readonly grow: SharedValue<number>;
  readonly children: ReactNode;
}): ReactNode {
  const clip = useAnimatedStyle(() => ({ height: PLOT_HEIGHT * grow.get() }), [grow]);
  return (
    <Animated.View style={clip} className="absolute inset-x-0 bottom-0 overflow-hidden">
      <View style={PLOT_BOX} className="absolute inset-x-0 bottom-0">
        {children}
      </View>
    </Animated.View>
  );
}

function Plot({ purges }: { readonly purges: readonly Purge[] }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const versions = useColour(VERSIONS);
  const trash = useColour(TRASH);
  const baseline = useColour('outline');
  const grow = useDraw(1, !useMotion().reduced);
  return (
    <View aria-hidden className="gap-1">
      <View style={PLOT_BOX} onLayout={onLayout}>
        {width > 0 ? (
          <Reveal grow={grow}>
            <Svg width={width} height={PLOT_HEIGHT}>
              <BarMarks shapes={purgeShapesOf(purges, width, trash)} fill={versions} />
              <Line
                x1={0}
                x2={width}
                y1={PLOT_HEIGHT - 0.5}
                y2={PLOT_HEIGHT - 0.5}
                stroke={baseline}
                strokeWidth={1}
              />
            </Svg>
          </Reveal>
        ) : null}
      </View>
      <BarLabels
        bars={purges.map((purge) => ({ key: purge.month, label: monthLabelOf(purge.month) }))}
        width={width}
      />
    </View>
  );
}

const SERIES: readonly ChartSeries[] = [
  { points: [], colour: VERSIONS, label: 'Old versions' },
  { points: [], colour: TRASH, label: 'Trash' },
];

export function PurgeBars({ purges }: { readonly purges: readonly Purge[] }): ReactNode {
  const totals = purgeTotalsOf(purges);
  const empty = totals.versionBytes + totals.trashBytes === 0;
  return (
    <Card title="What frees when" icon="history">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={purgeSummaryOf(purges)}
        className="gap-3"
      >
        <Text variant="footnote" tone="variant">
          Old versions and trash leave on their own, month by month
        </Text>
        {empty ? (
          <EmptyGraph text="Nothing is due to leave" height={PLOT_HEIGHT} />
        ) : (
          <Plot purges={purges} />
        )}
        <ChartLegend
          series={SERIES}
          valueOf={(entry) =>
            bytes(entry.colour === VERSIONS ? totals.versionBytes : totals.trashBytes)
          }
        />
      </View>
    </Card>
  );
}
