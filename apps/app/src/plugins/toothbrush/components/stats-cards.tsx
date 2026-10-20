import {
  BRUSH_MODE_LABELS,
  type BrushBrand,
  type BrushProfile,
  type BrushingStats,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Sparkline, Donut } from '../../../components/charts';
import { Text } from '../../../components/text';
import { MixBar } from '../charts/mix-bar';
import { RadialHistogram } from '../charts/radial-histogram';
import { SessionBarsChart } from '../charts/session-bars';
import { TrendChart } from '../charts/trend-chart';
import { ZoneBars } from '../charts/zone-bars';
import { brandUi } from '../brands';
import { INTENSITY_LABEL } from '../model/brush-model';
import {
  barsLabel,
  completion,
  deltaText,
  deltaTone,
  durationTrend,
  excessLabel,
  excessTrend,
  intensityMix,
  kpisOf,
  modeMix,
  radialBins,
  sessionBars,
  trendLabel,
  zoneBars,
} from '../model/stats-model';

const DONUT_PX = 112;
const SPARK_HEIGHT = 56;
const FULL = 100;

export function KpiGrid({ stats }: { readonly stats: BrushingStats }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      {kpisOf(stats).map((kpi) => (
        <View key={kpi.key} className="min-w-36 flex-1 gap-1 rounded-md bg-surface-1 p-3">
          <Text variant="footnote" tone="variant">
            {kpi.label}
          </Text>
          <Text variant="title-2" className="tabular">
            {kpi.value}
          </Text>
          {kpi.delta === null && kpi.key === 'goal' ? null : (
            <Badge label={deltaText(kpi.delta)} tone={deltaTone(kpi.delta)} />
          )}
        </View>
      ))}
    </View>
  );
}

export function BrushesCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  return (
    <Card title="Brushes" icon="toothbrush">
      <SessionBarsChart chart={sessionBars(stats)} label={barsLabel(stats)} />
    </Card>
  );
}

export function TimeCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  return (
    <Card title="Time per brush" icon="timer">
      <TrendChart
        trend={durationTrend(stats)}
        target={stats.goal.minimumSeconds ?? 120}
        label={trendLabel(stats)}
      />
    </Card>
  );
}

export function WholeRoutineCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  const donut = completion(stats);
  const { totals } = stats;
  return (
    <Card title="Whole routines" icon="circleCheck">
      <View className="flex-row items-center gap-4">
        <Donut
          size={DONUT_PX}
          label={donut.detail}
          slices={[
            { key: 'whole', value: totals.complete, colour: 'positive', label: 'Whole routine' },
            {
              key: 'short',
              value: totals.sessions - totals.complete,
              colour: 'warning',
              label: 'Stopped early',
            },
          ]}
        >
          <Text variant="title-3" className="tabular">
            {donut.label}
          </Text>
        </Donut>
        <Text variant="callout" className="min-w-0 flex-1">
          {donut.detail}
        </Text>
      </View>
    </Card>
  );
}

export function WhenCard({ stats }: { readonly stats: BrushingStats }): ReactNode {
  const { split } = stats;
  return (
    <Card title="When you brush" icon="clock">
      <View className="gap-3">
        <RadialHistogram
          bins={radialBins(stats)}
          label={`Brushes by hour of the day. ${String(split.morning)} in the morning, ${String(split.evening)} in the evening, ${String(split.other)} at other times.`}
        />
      </View>
    </Card>
  );
}

export function MixCard({
  stats,
  brand,
}: {
  readonly stats: BrushingStats;
  readonly brand: BrushBrand;
}): ReactNode {
  const intensity = intensityMix(stats, INTENSITY_LABEL);
  return (
    <Card title={intensity.length === 0 ? 'Modes' : 'Modes and intensity'} icon="customize">
      <View className="gap-4">
        <MixBar
          title="Modes"
          segments={modeMix(stats, BRUSH_MODE_LABELS, brandUi(brand).modeColour)}
        />
        {intensity.length === 0 ? null : <MixBar title="Intensity" segments={intensity} />}
      </View>
    </Card>
  );
}

export function ZoneCard({
  stats,
  profile,
}: {
  readonly stats: BrushingStats;
  readonly profile: BrushProfile;
}): ReactNode {
  const model = zoneBars(stats, profile.zones);
  if (model.bars.length === 0) {
    return null;
  }
  return (
    <Card title="Time in each zone" icon="gauge">
      <View className="gap-3">
        <ZoneBars model={model} source={profile.zoneSource} />
        {model.least === null ? null : (
          <Text variant="callout" tone="variant">
            You spend the least time on {model.least.toLowerCase()}.
          </Text>
        )}
      </View>
    </Card>
  );
}

export function PressureCard({
  stats,
  brand,
}: {
  readonly stats: BrushingStats;
  readonly brand: BrushBrand;
}): ReactNode {
  const points = excessTrend(stats);
  const label = excessLabel(points);
  const drawn = points.flatMap((point, index) =>
    point.share === null ? [] : [{ t: index, v: point.share * FULL }],
  );
  return (
    <Card title="Pressing too hard" icon="gauge">
      <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-2">
        {drawn.length < 2 ? null : (
          <Sparkline
            points={drawn}
            colour={brandUi(brand).pressure.too_high.colour}
            height={SPARK_HEIGHT}
            area
          />
        )}
        <Text variant="callout" tone="variant">
          {label}
        </Text>
      </View>
    </Card>
  );
}
