import type { StatsBests, TreadmillStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Sparkline } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { count, decimal } from '../../../format/number';
import {
  deltaText,
  deltaTone,
  kilometresText,
  landmarkLine,
  minutesText,
} from '../model/stats-model';
import { clockText } from '../model/treadmill-model';

interface Total {
  readonly label: string;
  readonly value: string;
  readonly delta: number | null;
}

function totalsOf(stats: TreadmillStats): readonly Total[] {
  const { totals, delta } = stats;
  const climb =
    totals.climbM > 0 || stats.previous.climbM > 0
      ? [{ label: 'Climb', value: `${count(Math.round(totals.climbM))} m`, delta: delta.climbM }]
      : [];
  return [
    { label: 'Distance', value: kilometresText(totals.distanceM), delta: delta.distanceM },
    { label: 'Time', value: minutesText(totals.activeSeconds), delta: delta.activeSeconds },
    { label: 'Steps', value: count(totals.steps), delta: delta.steps },
    { label: 'Energy', value: `${count(Math.round(totals.kcal))} kcal`, delta: delta.kcal },
    ...climb,
  ];
}

export function TotalsGrid({ stats }: { readonly stats: TreadmillStats }): ReactNode {
  const landmark = landmarkLine(stats.totals.climbM);
  return (
    <View className="gap-3">
      <TotalTiles stats={stats} />
      {landmark === null ? null : (
        <Text variant="callout" tone="variant">
          {landmark}
        </Text>
      )}
    </View>
  );
}

function TotalTiles({ stats }: { readonly stats: TreadmillStats }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      {totalsOf(stats).map((total) => (
        <View
          key={total.label}
          accessible
          accessibilityLabel={`${total.label} ${total.value}, ${deltaText(total.delta)} against the period before`}
          className="min-w-36 flex-1 gap-1 rounded-md bg-surface-2 p-3"
        >
          <Text variant="caption" tone="variant">
            {total.label}
          </Text>
          <Text
            variant="title-3"
            className={total.label === 'Climb' ? 'tabular text-viz-violet' : 'tabular'}
          >
            {total.value}
          </Text>
          <View className="flex-row">
            <Badge label={deltaText(total.delta)} tone={deltaTone(total.delta)} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PerSession({ stats }: { readonly stats: TreadmillStats }): ReactNode {
  const { perSession } = stats;
  const rows: readonly (readonly [string, string])[] = [
    ['Distance', kilometresText(perSession.distanceM)],
    ['Time', minutesText(perSession.activeSeconds)],
    ['Speed', `${decimal(perSession.avgKmh, 1)} km/h`],
    ['Steps', count(Math.round(perSession.steps))],
  ];
  return (
    <View className="flex-row flex-wrap gap-x-6 gap-y-2">
      {rows.map(([label, value]) => (
        <View key={label} accessible accessibilityLabel={`Average ${label} ${value}`}>
          <Text variant="caption" tone="variant">
            {label}
          </Text>
          <Text variant="body-strong" className="tabular">
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

interface Best {
  readonly label: string;
  readonly value: string;
}

function bestsOf(bests: StatsBests): readonly Best[] {
  const found: Best[] = [];
  if (bests.longestDistanceM !== null) {
    found.push({ label: 'Longest walk', value: kilometresText(bests.longestDistanceM.value) });
  }
  if (bests.longestSeconds !== null) {
    found.push({ label: 'Longest time', value: clockText(bests.longestSeconds.value) });
  }
  if (bests.fastestAvgKmh !== null) {
    found.push({
      label: 'Fastest average',
      value: `${decimal(bests.fastestAvgKmh.value, 1)} km/h`,
    });
  }
  if (bests.topSpeedKmh !== null) {
    found.push({ label: 'Top speed', value: `${decimal(bests.topSpeedKmh.value, 1)} km/h` });
  }
  if (bests.mostSteps !== null) {
    found.push({ label: 'Most steps', value: count(bests.mostSteps.value) });
  }
  if (bests.mostClimbM !== null) {
    found.push({ label: 'Best climb', value: `${count(Math.round(bests.mostClimbM.value))} m` });
  }
  return found;
}

export function BestsShelf({ bests }: { readonly bests: StatsBests }): ReactNode {
  const items = bestsOf(bests);
  if (items.length === 0) {
    return (
      <Text variant="callout" tone="variant">
        Your personal bests appear after the first session.
      </Text>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((best) => (
        <View
          key={best.label}
          accessible
          accessibilityLabel={`Personal best, ${best.label} ${best.value}`}
          className="min-w-36 flex-1 flex-row items-center gap-3 rounded-md bg-surface-2 p-3"
        >
          <Icon name="trophy" size={24} tone="warning" />
          <View className="min-w-0 flex-1">
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {best.label}
            </Text>
            <Text variant="body-strong" className="tabular" numberOfLines={1}>
              {best.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

interface Multiple {
  readonly label: string;
  readonly unit: string;
  readonly values: readonly number[];
  readonly digits: number;
}

function multiplesOf(stats: TreadmillStats): readonly Multiple[] {
  const rows = stats.efficiency;
  const pick = (read: (row: (typeof rows)[number]) => number | null): number[] =>
    rows.flatMap((row) => {
      const value = read(row);
      return value === null ? [] : [value];
    });
  return [
    { label: 'Average speed', unit: 'km/h', values: pick((row) => row.avgKmh), digits: 1 },
    { label: 'Cadence', unit: 'steps/min', values: pick((row) => row.cadence), digits: 0 },
    { label: 'Stride', unit: 'm', values: pick((row) => row.strideM), digits: 2 },
  ].filter((multiple) => multiple.values.length > 0);
}

export function SmallMultiples({ stats }: { readonly stats: TreadmillStats }): ReactNode {
  const multiples = multiplesOf(stats);
  if (multiples.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-3">
      {multiples.map((multiple) => {
        const last = multiple.values[multiple.values.length - 1] ?? 0;
        const points = multiple.values.map((value, index) => ({ t: index, v: value }));
        return (
          <View
            key={multiple.label}
            accessible
            accessibilityLabel={`${multiple.label}, last session ${decimal(last, multiple.digits)} ${multiple.unit}, over ${String(multiple.values.length)} sessions`}
            className="min-w-36 flex-1 gap-1 rounded-md bg-surface-2 p-3"
          >
            <Text variant="caption" tone="variant">
              {multiple.label}
            </Text>
            <Text variant="body-strong" className="tabular">
              {decimal(last, multiple.digits)} {multiple.unit}
            </Text>
            {points.length >= 2 ? (
              <View aria-hidden>
                <Sparkline points={points} colour="primary" height={32} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
