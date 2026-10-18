import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { formatLaundryMinutes } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Bars } from '../../../components/charts';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Cycle } from './cycles';
import { FieldLabel } from './parts';

const SHOWN_COMPACT = 3;
const SHOWN_WIDE = 10;
const CHARTED = 12;

interface Metric {
  readonly key: 'energy' | 'water';
  readonly title: string;
  readonly unit: string;
  readonly colour: 'viz-2' | 'viz-1';
  readonly digits: number;
}

const ENERGY: Metric = {
  key: 'energy',
  title: 'Energy per cycle',
  unit: 'kWh',
  colour: 'viz-2',
  digits: 1,
};

const WATER: Metric = {
  key: 'water',
  title: 'Water per cycle',
  unit: 'L',
  colour: 'viz-1',
  digits: 0,
};

const METRICS: readonly Metric[] = [ENERGY, WATER];

function chartedCycles(cycles: readonly Cycle[]): readonly Cycle[] {
  return cycles.slice(0, CHARTED).reverse();
}

function figureText(value: number | null, metric: Metric): string {
  return value === null ? '—' : `${value.toFixed(metric.digits)} ${metric.unit}`;
}

function Chart({
  cycles,
  metric,
}: {
  readonly cycles: readonly Cycle[];
  readonly metric: Metric;
}): ReactNode {
  const figures = cycles.flatMap((cycle) => {
    const value = cycle[metric.key];
    return value === null ? [] : [{ cycle, value }];
  });
  if (figures.length === 0) {
    return null;
  }
  const latest = figures.at(-1);
  const spoken = `${metric.title}, last ${String(cycles.length)} cycles: ${figures
    .map(({ cycle, value }) => `${cycle.program} ${figureText(value, metric)}`)
    .join(', ')}`;
  return (
    <View className="min-w-56 flex-1 gap-1.5">
      <FieldLabel text={metric.title} />
      <Text variant="callout" className="tabular">
        {latest === undefined ? '' : `Latest: ${figureText(latest.value, metric)}`}
      </Text>
      <Bars
        bars={figures.map(({ cycle, value }) => ({ key: cycle.id, value }))}
        colour={metric.colour}
        label={spoken}
        height={72}
        formatValue={(value) => figureText(value, metric)}
      />
    </View>
  );
}

function Row({ cycle, now }: { readonly cycle: Cycle; readonly now: number }): ReactNode {
  const done = cycle.outcome === 'completed';
  const detail = done
    ? `${moment(cycle.finishedAt, now)}${cycle.minutes === null ? '' : ` · ${formatLaundryMinutes(cycle.minutes)}`}`
    : `${moment(cycle.finishedAt, now)} · Stopped${cycle.minutes === null ? '' : ` after ${formatLaundryMinutes(cycle.minutes)}`}`;
  return (
    <View
      accessible
      accessibilityLabel={`${cycle.program}, ${detail}, ${figureText(cycle.energy, ENERGY)}, ${figureText(cycle.water, WATER)}`}
      className="flex-row items-start gap-3 border-t-hairline border-outline-variant py-2.5"
    >
      <View className="pt-0.5">
        <Icon
          name={done ? 'circleCheck' : 'square'}
          size={16}
          tone={done ? 'positive' : 'variant'}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {cycle.program}
        </Text>
        <Text variant="footnote" tone="variant">
          {detail}
        </Text>
      </View>
      <View className="items-end">
        <Text variant="callout" className="tabular">
          {figureText(cycle.energy, ENERGY)}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {figureText(cycle.water, WATER)}
        </Text>
      </View>
    </View>
  );
}

function Charts({ cycles }: { readonly cycles: readonly Cycle[] }): ReactNode {
  const charted = chartedCycles(cycles);
  if (!charted.some((cycle) => cycle.energy !== null || cycle.water !== null)) {
    return null;
  }
  return (
    <View className="gap-3">
      <Text
        variant="footnote"
        tone="variant"
      >{`Last ${String(charted.length)} cycles, oldest to newest.`}</Text>
      <View className="flex-row flex-wrap gap-4">
        {METRICS.map((metric) => (
          <Chart key={metric.key} cycles={charted} metric={metric} />
        ))}
      </View>
    </View>
  );
}

function MoreLink({
  label,
  text,
  onPress,
  to,
}: {
  readonly label: string;
  readonly text: string;
  readonly onPress?: () => void;
  readonly to?: ReturnType<typeof href.deviceSection>;
}): ReactNode {
  return (
    <Interactive
      label={label}
      {...(onPress === undefined ? {} : { onPress })}
      {...(to === undefined ? {} : { href: to })}
      className="min-h-touch-min justify-center self-start"
    >
      <Text variant="body-strong" className="underline">
        {text}
      </Text>
    </Interactive>
  );
}

export function HistoryCard({
  deviceId,
  cycles,
}: {
  readonly deviceId: string;
  readonly cycles: readonly Cycle[];
}): ReactNode {
  const [all, setAll] = useState(false);
  const compact = !atLeast(useSizeClass().width, 'medium');
  const now = useMinute();
  const limit = compact && !all ? SHOWN_COMPACT : SHOWN_WIDE;
  return (
    <Card title="History">
      <View className="gap-3">
        {cycles.length === 0 ? (
          <Text variant="callout" tone="variant">
            Finished cycles show up here.
          </Text>
        ) : null}
        <Charts cycles={cycles} />
        <View>
          {cycles.slice(0, limit).map((cycle) => (
            <Row key={cycle.id} cycle={cycle} now={now} />
          ))}
        </View>
        {compact && cycles.length > SHOWN_COMPACT ? (
          <MoreLink
            label={all ? 'Show fewer cycles' : 'Show more cycles'}
            text={all ? 'Show fewer' : 'Show more ›'}
            onPress={() => {
              setAll(!all);
            }}
          />
        ) : null}
        <MoreLink
          label="Show all in Activity"
          text="Show all in Activity ›"
          to={href.deviceSection(deviceId, 'activity')}
        />
      </View>
    </Card>
  );
}
