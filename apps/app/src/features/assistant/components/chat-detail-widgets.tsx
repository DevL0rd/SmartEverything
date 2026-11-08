import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import type { AiChatRow } from '@smarteverything/domain';
import { Sparkline, type ChartPoint } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import { MINUTE_MS } from '../../../format/time';
import { CompactChatButton } from '../chats/compact-chat-button';
import {
  usageTimeDomain,
  useChatMeterHistory,
  type MeterTrends,
  type UsageDomain,
} from '../data/chat-meter-trends';
import { useChatUsageHistory } from '../data/chat-usage-history';
import type { ContextUsage } from '../model/context-usage';
import type { ChatBilling } from '../provider/subscription-usage';
import {
  remainingPercent,
  subscriptionResetText,
  type WeeklyAllowance,
} from '../provider/subscription-usage-values';
import { BOTTOM_READING_ID, type BottomReading } from './bottom-status-model';

interface UsageSeries {
  readonly name: string;
  readonly points: readonly ChartPoint[];
  readonly colour: ColourRole;
  readonly partial?: boolean;
}

const PERCENT_DOMAIN = [0, 100] as const;

function SeriesMark({ name, colour, partial = false }: UsageSeries): ReactNode {
  const mark = { backgroundColor: useColour(colour) };
  return (
    <View
      accessible
      accessibilityLabel={partial ? `${name}, partial history` : name}
      className="flex-row items-center gap-1 rounded-sm bg-surface-1 px-1"
    >
      <View className="size-1.5 rounded-full" style={mark} />
      <Text variant="caption" tone="variant">
        {partial ? `${name}*` : name}
      </Text>
    </View>
  );
}

function UsagePlot({
  series,
  domain,
  timeDomain,
}: {
  readonly series: readonly UsageSeries[];
  readonly domain: UsageDomain;
  readonly timeDomain: UsageDomain;
}): ReactNode {
  if (series.length === 0) return null;
  const names = series
    .map((line) => (line.partial === true ? `${line.name}, partial history` : line.name))
    .join(', ');
  const minutes = Math.ceil((timeDomain[1] - timeDomain[0]) / MINUTE_MS);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${names} over ${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}`}
      className="absolute inset-x-0 bottom-0"
      pointerEvents="none"
    >
      {series.map(({ name, points, colour }) => (
        <View key={name} className="absolute inset-x-0 bottom-0">
          <Sparkline
            points={points}
            height={48}
            colour={colour}
            area
            domain={domain}
            timeDomain={timeDomain}
          />
        </View>
      ))}
    </View>
  );
}

function visibleSeries(
  series: readonly UsageSeries[],
  [from, to]: UsageDomain,
): readonly UsageSeries[] {
  return series
    .map((line) => ({
      ...line,
      points: line.points.filter((point) => point.t >= from && point.t <= to),
    }))
    .filter((line) => line.points.length >= 2);
}

function UsageLegend({ series }: { readonly series: readonly UsageSeries[] }): ReactNode {
  if (series.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-x-2 px-3 pb-2">
      {series.map((line) => (
        <SeriesMark key={line.name} {...line} />
      ))}
    </View>
  );
}

interface UsageTileProps {
  readonly reading: BottomReading;
  readonly selected: boolean;
  readonly icon: IconName;
  readonly title: string;
  readonly value: string;
  readonly series: readonly UsageSeries[];
  readonly domain: UsageDomain;
  readonly timeDomain: UsageDomain;
  readonly action?: ReactNode;
  readonly emptyCaption?: string;
}

function UsageTile({
  icon,
  title,
  value,
  series,
  domain,
  timeDomain,
  action,
  emptyCaption,
  reading,
  selected,
}: UsageTileProps): ReactNode {
  const visible = visibleSeries(series, timeDomain);
  return (
    <View
      nativeID={BOTTOM_READING_ID[reading]}
      className={cn(
        'min-h-20 min-w-0 flex-1 overflow-hidden rounded-md border-hairline bg-surface-1',
        selected ? 'border-primary' : 'border-outline-variant',
      )}
    >
      <UsagePlot series={visible} domain={domain} timeDomain={timeDomain} />
      <View className="flex-row items-center gap-2 px-3 pt-2">
        <Icon name={icon} size={16} tone="primary" />
        <Text variant="callout" className="min-w-0 flex-1 font-sans-medium">
          {title}
        </Text>
      </View>
      <View className="min-h-touch-min flex-row flex-wrap items-center justify-between gap-x-2 px-3">
        <Text variant="body-strong" className="min-w-0 tabular">
          {value}
        </Text>
        {action}
      </View>
      {emptyCaption !== undefined && visible.length === 0 ? (
        <Text variant="caption" tone="variant" className="px-3 pb-2">
          {emptyCaption}
        </Text>
      ) : (
        <UsageLegend series={emptyCaption === undefined ? series : visible} />
      )}
    </View>
  );
}

type MeterHistory = ReturnType<typeof useChatMeterHistory>;
const NO_METER_TRENDS = { context: [], cache: [], subscription: [] } as const;

function meterHistoryCaption({ data, isLoading, isError }: MeterHistory): string {
  if (isLoading) return 'Loading recent readings…';
  if (isError) return 'History unavailable';
  if ((data?.context.length ?? 0) + (data?.cache.length ?? 0) === 0) return 'No recent readings';
  return 'Waiting for more readings';
}

function ContextWidget({
  chat,
  context,
  blocked,
  history,
  timeDomain,
  selected,
}: {
  readonly selected: boolean;
  readonly chat: AiChatRow;
  readonly context: ContextUsage;
  readonly blocked: boolean;
  readonly history: MeterHistory;
  readonly timeDomain: UsageDomain;
}): ReactNode {
  const { percent } = context;
  const trends = history.data ?? NO_METER_TRENDS;
  return (
    <UsageTile
      icon="gauge"
      title="Context"
      reading="context"
      selected={selected}
      value={percent === null ? 'Unavailable' : `${String(percent)}%`}
      series={[
        { name: 'Context', points: trends.context, colour: 'primary' },
        { name: 'Cache hits', points: trends.cache, colour: 'viz-1' },
      ]}
      domain={PERCENT_DOMAIN}
      timeDomain={timeDomain}
      emptyCaption={meterHistoryCaption(history)}
      action={percent === null ? null : <CompactChatButton chat={chat} blocked={blocked} />}
    />
  );
}

interface CostWidgetProps {
  readonly selected: boolean;
  readonly billing: 'metered' | 'unknown';
  readonly total: string;
  readonly shown: boolean;
  readonly recorded: boolean;
  readonly points: readonly ChartPoint[];
  readonly helpers: readonly ChartPoint[];
  readonly costPartial: boolean;
  readonly helpersPartial: boolean;
  readonly timeDomain: UsageDomain;
}

function costValue({ billing, total, shown, recorded }: CostWidgetProps): string {
  if (billing === 'unknown' && !recorded) return 'Unavailable';
  return shown ? total : 'Hidden';
}

function CostWidget(props: CostWidgetProps): ReactNode {
  const showChart = props.shown;
  const series: readonly UsageSeries[] = showChart
    ? [
        { name: 'This chat', points: props.points, colour: 'positive', partial: props.costPartial },
        { name: 'Helpers', points: props.helpers, colour: 'viz-3', partial: props.helpersPartial },
      ]
    : [];
  const max = series.reduce(
    (peak, line) => line.points.reduce((high, point) => Math.max(high, point.v), peak),
    1,
  );
  return (
    <UsageTile
      icon="trendUp"
      title="Cost"
      reading="billing"
      selected={props.selected}
      value={costValue(props)}
      series={series}
      domain={[0, max]}
      timeDomain={props.timeDomain}
    />
  );
}

function UsageMetadata({
  resetAt,
  meteredTotal,
}: {
  readonly resetAt: number | null;
  readonly meteredTotal: string | null;
}): ReactNode {
  if (resetAt === null && meteredTotal === null) return null;
  return (
    <View>
      {resetAt === null ? null : (
        <Text variant="caption" tone="variant">
          Resets {subscriptionResetText(resetAt)}
        </Text>
      )}
      {meteredTotal === null ? null : (
        <Text variant="caption" tone="variant">
          Metered spend {meteredTotal}
        </Text>
      )}
    </View>
  );
}

function SubscriptionWidget({
  weekly,
  points,
  meteredTotal,
  timeDomain,
  selected,
}: {
  readonly selected: boolean;
  readonly weekly: WeeklyAllowance | null;
  readonly points: readonly ChartPoint[];
  readonly meteredTotal: string | null;
  readonly timeDomain: UsageDomain;
}): ReactNode {
  return (
    <UsageTile
      icon="trendUp"
      title="Usage"
      reading="billing"
      selected={selected}
      value={weekly?.text ?? 'Unavailable'}
      series={[{ name: 'Weekly allowance', points, colour: 'positive' }]}
      domain={PERCENT_DOMAIN}
      timeDomain={timeDomain}
      action={<UsageMetadata resetAt={weekly?.resetAt ?? null} meteredTotal={meteredTotal} />}
    />
  );
}

export interface UsageDetailProps {
  readonly chat: AiChatRow;
  readonly context: ContextUsage;
  readonly billing: ChatBilling['kind'];
  readonly weekly: WeeklyAllowance | null;
  readonly selected?: BottomReading | null;
  readonly blocked: boolean;
  readonly total: string;
  readonly shown: boolean;
  readonly recorded: boolean;
}

function weeklyChartPoints(
  points: MeterTrends['subscription'],
  resetAt: number | null,
): readonly ChartPoint[] {
  if (resetAt === null) return [];
  return points
    .filter((point) => point.resetAt === resetAt)
    .map((point) => ({ t: point.t, v: remainingPercent(point.v) }));
}

function BillingWidget({
  usage,
  history,
  points,
  timeDomain,
}: {
  readonly usage: UsageDetailProps;
  readonly history: ReturnType<typeof useChatUsageHistory>;
  readonly points: readonly ChartPoint[];
  readonly timeDomain: UsageDomain;
}): ReactNode {
  const { billing, weekly, selected, total, shown, recorded } = usage;
  if (billing === 'subscription-only') {
    return (
      <SubscriptionWidget
        weekly={weekly}
        selected={selected === 'billing'}
        points={points}
        timeDomain={timeDomain}
        meteredTotal={shown && recorded ? total : null}
      />
    );
  }
  return (
    <CostWidget
      billing={billing}
      selected={selected === 'billing'}
      total={total}
      shown={shown}
      recorded={recorded}
      points={history.cost}
      helpers={history.helpers}
      costPartial={history.costPartial}
      helpersPartial={history.helpersPartial}
      timeDomain={timeDomain}
    />
  );
}

export function UsageDetails({
  usage,
  children,
}: {
  readonly usage: UsageDetailProps;
  readonly children: (tiles: ReactNode) => ReactNode;
}): ReactNode {
  const { chat, context, billing, weekly, selected, blocked, shown } = usage;
  const meters = useChatMeterHistory(chat.id);
  const trends = meters.data ?? NO_METER_TRENDS;
  const history = useChatUsageHistory(chat, shown && billing === 'metered');
  const weeklyPoints = weeklyChartPoints(trends.subscription, weekly?.resetAt ?? null);
  const timeDomain = usageTimeDomain(
    trends.context,
    trends.cache,
    history.cost,
    history.helpers,
    weeklyPoints,
  );
  return children([
    <ContextWidget
      key="context"
      chat={chat}
      context={context}
      blocked={blocked}
      selected={selected === 'context'}
      history={meters}
      timeDomain={timeDomain}
    />,
    <BillingWidget
      key="billing"
      usage={usage}
      history={history}
      points={weeklyPoints}
      timeDomain={timeDomain}
    />,
  ]);
}
