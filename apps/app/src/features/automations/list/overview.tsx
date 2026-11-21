import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { weekdayShort } from '../../../format/time';
import type { ListEntry } from './list-entries';
import type { ListLinks } from './list-links';
import type { FilterId } from './list-view';
import { peakOf, stackOf, type DayBar, type Health, type StackSegment } from './run-stats';
import { CARD_FRAME } from './card-frame';
import { TimelineBand } from './timeline-band';
import type { AutomationsList } from './use-list';

const CHART_HEIGHT = { roomy: 112, compact: 72 } as const;

type ChartSize = keyof typeof CHART_HEIGHT;
const THREE_UP_FROM = 1100;
const TWO_UP_FROM = 640;

const FILL = {
  succeeded: 'bg-positive',
  failed: 'bg-critical',
  ignored: 'bg-outline-variant',
} as const;

const LEGEND: readonly { readonly key: keyof typeof FILL; readonly label: string }[] = [
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'failed', label: 'Failed' },
  { key: 'ignored', label: 'Skipped' },
];

type Layout = 'stacked' | 'two' | 'three';

function layoutOf(width: number): Layout {
  if (width >= THREE_UP_FROM) return 'three';
  return width >= TWO_UP_FROM ? 'two' : 'stacked';
}

function dayName(day: string, last: boolean): string {
  return last ? 'Today' : weekdayShort(Date.parse(`${day}T12:00:00Z`));
}

function runsOfDay(day: DayBar): number {
  return day.succeeded + day.failed + day.ignored;
}

function Stat({
  value,
  label,
  tone = 'default',
  onPress,
}: {
  readonly value: string;
  readonly label: string;
  readonly tone?: Tone;
  readonly onPress?: () => void;
}): ReactNode {
  const body = (
    <>
      <Text variant="title-1" tone={tone} className="tabular">
        {value}
      </Text>
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </>
  );
  if (onPress === undefined) return <View className="w-22">{body}</View>;
  return (
    <Interactive
      onPress={onPress}
      label={`${value} ${label}`}
      className="-mx-1 w-24 rounded-md px-1"
      layerClassName="rounded-md"
    >
      {body}
    </Interactive>
  );
}

function Segment({ segment }: { readonly segment: StackSegment }): ReactNode {
  const size = { height: segment.height };
  return <View style={size} className={FILL[segment.outcome]} />;
}

function DayColumn({
  day,
  peak,
  last,
  size,
}: {
  readonly day: DayBar;
  readonly peak: number;
  readonly last: boolean;
  readonly size: ChartSize;
}): ReactNode {
  const total = runsOfDay(day);
  const name = dayName(day.day, last);
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${String(total)} runs, ${String(day.failed)} failed`}
      className="min-w-0 flex-1 items-center gap-1"
    >
      <Text variant="caption" tone={total === 0 ? 'faint' : 'variant'} className="tabular">
        {String(total)}
      </Text>
      <View style={CHART_STYLE[size]} className="w-full max-w-12 justify-end">
        <View className="flex-col-reverse overflow-hidden rounded-t-sm">
          {stackOf(day, peak, CHART_HEIGHT[size]).map((segment) => (
            <Segment key={segment.outcome} segment={segment} />
          ))}
        </View>
        {total === 0 ? <View className="h-0.5 rounded-full bg-outline-variant" /> : null}
      </View>
      <Text variant="caption" tone={last ? 'default' : 'variant'}>
        {name}
      </Text>
    </View>
  );
}

const CHART_STYLE: Readonly<Record<ChartSize, ViewStyle>> = {
  roomy: { height: CHART_HEIGHT.roomy },
  compact: { height: CHART_HEIGHT.compact },
};

function Legend(): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      {LEGEND.map((item) => (
        <View key={item.key} className="flex-row items-center gap-1.5">
          <View className={cn('size-2.5 rounded-full', FILL[item.key])} />
          <Text variant="caption" tone="variant">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function successShare(week: readonly DayBar[]): string {
  const done = week.reduce((sum, day) => sum + day.succeeded + day.failed, 0);
  if (done === 0) return 'No runs';
  const succeeded = week.reduce((sum, day) => sum + day.succeeded, 0);
  return `${String(Math.round((succeeded / done) * 100))}%`;
}

function Stats({
  health,
  weekRuns,
  onFilter,
}: {
  readonly health: Health;
  readonly weekRuns: number;
  readonly onFilter: (filter: FilterId) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-3">
      <Stat value={String(weekRuns)} label="Last 7 days" />
      <Stat value={String(health.runsToday)} label="Today" />
      <Stat
        value={String(health.failedToday)}
        label="Failed today"
        tone={health.failedToday > 0 ? 'critical' : 'default'}
        onPress={() => {
          onFilter('failing');
        }}
      />
      <Stat
        value={String(health.waiting)}
        label="Waiting now"
        onPress={() => {
          onFilter('running');
        }}
      />
      <Stat value={successShare(health.week)} label="Succeeded" />
    </View>
  );
}

function RunsCard({
  health,
  onFilter,
  size,
}: {
  readonly health: Health;
  readonly onFilter: (filter: FilterId) => void;
  readonly size: ChartSize;
}): ReactNode {
  const peak = peakOf(health.week);
  const weekRuns = health.week.reduce((sum, day) => sum + runsOfDay(day), 0);
  return (
    <View className={CARD_FRAME}>
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text variant="title-3">Runs this week</Text>
        <Legend />
      </View>
      <Stats health={health} weekRuns={weekRuns} onFilter={onFilter} />
      <View
        accessibilityLabel="Runs per day over the last 7 days"
        className="flex-row items-end gap-2 pt-1"
      >
        {health.week.map((day, index) => (
          <DayColumn
            key={day.day}
            day={day}
            peak={peak}
            last={index === health.week.length - 1}
            size={size}
          />
        ))}
      </View>
    </View>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function AttentionCard({
  entries,
  failedThisWeek,
}: {
  readonly entries: readonly ListEntry[];
  readonly failedThisWeek: number;
}): ReactNode {
  const failing = entries.filter((entry) => entry.lastError !== null).length;
  const weekLine =
    failedThisWeek === 0
      ? 'No failed runs in the last 7 days'
      : `${plural(failedThisWeek, 'failed run', 'failed runs')} in the last 7 days`;
  return (
    <View className={CARD_FRAME}>
      <Text variant="title-3">Needs attention</Text>
      {failing === 0 ? (
        <View className="flex-row items-center gap-3">
          <IconWell icon="check" colour="positive" size="s" />
          <View className="min-w-0 flex-1">
            <Text variant="body-strong">All clear</Text>
            <Text variant="caption" tone="variant">
              {failedThisWeek === 0
                ? weekLine
                : `${plural(failedThisWeek, 'failed run', 'failed runs')} this week, every automation recovered`}
            </Text>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-3">
          <IconWell icon="alert" colour="critical" size="s" />
          <View className="min-w-0 flex-1">
            <Text variant="body-strong" tone="critical">
              {`${plural(failing, 'automation', 'automations')} failing`}
            </Text>
            <Text variant="caption" tone="variant">
              {`${weekLine}. Listed first under Needs attention.`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const PANE: Readonly<Record<Layout, string>> = {
  three: 'min-w-0 flex-1',
  two: 'min-w-0 flex-1',
  stacked: '',
};

export function Overview({
  list,
  links,
}: {
  readonly list: AutomationsList;
  readonly links: ListLinks;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const layout = layoutOf(width);
  const failedThisWeek = list.health.week.reduce((sum, day) => sum + day.failed, 0);
  const runs = (
    <RunsCard
      size={layout === 'stacked' ? 'compact' : 'roomy'}
      health={list.health}
      onFilter={list.setFilter}
    />
  );
  const next = <TimelineBand events={list.events} links={links} timeZone={list.timeZone} />;
  const attention = <AttentionCard entries={list.entries} failedThisWeek={failedThisWeek} />;
  return (
    <View onLayout={onLayout} className="gap-grid-gap">
      {layout === 'three' ? (
        <View className="flex-row items-stretch gap-grid-gap">
          <View className="min-w-0 flex-3">{runs}</View>
          <View className="min-w-0 flex-2">{next}</View>
          <View className="min-w-0 flex-2">{attention}</View>
        </View>
      ) : (
        <>
          {runs}
          <View className={cn('gap-grid-gap', layout === 'two' && 'flex-row items-stretch')}>
            <View className={PANE[layout]}>{next}</View>
            <View className={PANE[layout]}>{attention}</View>
          </View>
        </>
      )}
    </View>
  );
}
