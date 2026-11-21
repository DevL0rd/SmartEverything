import type { PlannerDay, PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Arc } from '../../../components/charts/arc';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame, widgetBodyHeight } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { useDayKey } from '../../../store/clock';
import { useHubOffline } from '../../clock';
import { DeviceFace } from '../../devices';
import { usePlannerDay, usePlannerItems, useVisibleMinute } from '../data';
import { DayStrip } from '../today/day-strip';
import { lensOf } from '../today/now-lens';
import { useInstantClock } from '../../../store/clock-format';
import { NO_HIDDEN, useDayLines, useStripModel, type DayLine } from './day-lines';
import {
  SECTION_GAP,
  STRIP_HEIGHT,
  dayCountsOf,
  deviceIdsOf,
  isSplit,
  leadHeightOf,
  leadWhenOf,
  linesFit,
  rowLineOf,
  rowsShownOf,
  LINE_GAP,
} from './home-fit';

const FRAME = {
  title: 'Up next',
  icon: 'calendar',
  accent: 'primary',
  href: href.planner.index(),
} as const;

const OPEN = { label: 'Open Planner', href: href.planner.index() } as const;
const RING = { size: 18, thickness: 3 } as const;

export function WidgetOffline(): ReactNode {
  return (
    <Text variant="caption" tone="warning" numberOfLines={1}>
      Hub offline
    </Text>
  );
}

export function DayBadge({ day }: { readonly day: PlannerDay }): ReactNode {
  const counts = dayCountsOf(day);
  const whole = counts.missed + counts.left + counts.done;
  return (
    <View className="flex-row items-center gap-1.5">
      {counts.missed === 0 ? null : (
        <Text variant="caption" tone="critical" className="tabular-nums">
          {`${String(counts.missed)} missed`}
        </Text>
      )}
      {counts.left === 0 ? null : (
        <Text variant="caption" tone="variant" className="tabular-nums">
          {`${String(counts.left)} left`}
        </Text>
      )}
      {counts.missed + counts.left > 0 || counts.done === 0 ? null : (
        <Text variant="caption" tone="variant" className="tabular-nums">
          {`${String(counts.done)} done`}
        </Text>
      )}
      {counts.done === 0 ? null : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${plural(counts.done, 'thing')} of ${String(whole)} done today`}
        >
          <Arc
            value={counts.share}
            size={RING.size}
            thickness={RING.thickness}
            colour="primary"
            ticking={false}
          />
        </View>
      )}
    </View>
  );
}

function DayRow({ line, more }: { readonly line: DayLine; readonly more: number }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={more === 0 ? line.spoken : `${line.spoken}, ${String(more)} more today`}
      className="flex-row items-center gap-2"
    >
      <Text
        variant="footnote"
        tone={line.missed ? 'critical' : 'variant'}
        numberOfLines={1}
        className="w-16 shrink-0 font-mono tabular"
      >
        {line.time}
      </Text>
      <View className={cn('size-2 rounded-full', line.dot)} />
      <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
        {line.title}
      </Text>
      {more === 0 ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink-0 tabular-nums">
          {`+${String(more)}`}
        </Text>
      )}
    </View>
  );
}

export function DayRows({
  lines,
  fit,
  className,
}: {
  readonly lines: readonly DayLine[];
  readonly fit: number;
  readonly className?: string;
}): ReactNode {
  const { shown, more } = rowsShownOf(lines.length, fit);
  if (shown === 0 && more === 0) return null;
  const trailing = fit === 1 && more > 0;
  return (
    <View className={cn('min-w-0 gap-1', className)}>
      {lines.slice(0, shown).map((line, index) => (
        <DayRow key={line.key} line={line} more={trailing && index === shown - 1 ? more : 0} />
      ))}
      {more === 0 || trailing ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="pl-22 tabular-nums">
          {`+${String(more)} more today`}
        </Text>
      )}
    </View>
  );
}

function itemOf(
  items: readonly PlannerItemRow[],
  occurrence: PlannerOccurrenceView,
): PlannerItemRow | undefined {
  return items.find((item) => item.id === occurrence.item_id);
}

function Lead({
  occurrence,
  day,
  now,
  split,
  report,
}: {
  readonly occurrence: PlannerOccurrenceView;
  readonly day: PlannerDay;
  readonly now: number;
  readonly split: boolean;
  readonly report: boolean;
}): ReactNode {
  const item = itemOf(usePlannerItems(null), occurrence);
  const instant = useInstantClock();
  const devices = deviceIdsOf(occurrence);
  return (
    <View className={cn('min-w-0 gap-1', split && 'flex-1')}>
      <Text variant="body-strong" numberOfLines={report ? 2 : 1}>
        {occurrence.title}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
        {leadWhenOf(occurrence, day.time_zone, now, instant)}
      </Text>
      {report && occurrence.location !== null ? (
        <View className="flex-row items-center gap-1">
          <Icon name="mapPin" size={14} tone="faint" />
          <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
            {occurrence.location}
          </Text>
        </View>
      ) : null}
      {report && item !== undefined && item.notes !== '' ? (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {item.notes}
        </Text>
      ) : null}
      {devices.length === 0 ? null : (
        <View className="flex-row flex-wrap gap-2 overflow-hidden">
          {devices.map((deviceId) => (
            <DeviceFace key={deviceId} deviceId={deviceId} face="chip" context="nested" />
          ))}
        </View>
      )}
    </View>
  );
}

function UpNextReport({
  day,
  occurrence,
  now,
  lines,
}: {
  readonly day: PlannerDay;
  readonly occurrence: PlannerOccurrenceView;
  readonly now: number;
  readonly lines: readonly DayLine[];
}): ReactNode {
  const { frame } = useWidgetFace();
  const strip = useStripModel(day);
  const top = widgetBodyHeight(frame) - STRIP_HEIGHT - SECTION_GAP;
  const fit = linesFit(top, rowLineOf(frame.idiom), LINE_GAP);
  return (
    <View className="flex-1 gap-3">
      <View className="flex-1 flex-row gap-4">
        <Lead occurrence={occurrence} day={day} now={now} split report />
        {lines.length === 0 ? null : <View className="w-px self-stretch bg-outline-variant" />}
        {lines.length === 0 ? null : <DayRows lines={lines} fit={fit} className="flex-1" />}
      </View>
      <DayStrip model={strip} compact />
    </View>
  );
}

function UpNextBody({
  day,
  occurrence,
  now,
}: {
  readonly day: PlannerDay;
  readonly occurrence: PlannerOccurrenceView;
  readonly now: number;
}): ReactNode {
  const { frame, cls } = useWidgetFace();
  const lines = useDayLines(day, occurrence);
  if (cls === 'xl')
    return <UpNextReport day={day} occurrence={occurrence} now={now} lines={lines} />;
  const split = isSplit(cls);
  const tall = cls === 'l';
  const body = widgetBodyHeight(frame) - (tall ? STRIP_HEIGHT + SECTION_GAP : 0);
  const lead = leadHeightOf(frame.idiom, deviceIdsOf(occurrence).length > 0);
  const room = split ? body : body - lead - SECTION_GAP;
  const fit = linesFit(room, rowLineOf(frame.idiom), LINE_GAP);
  const shown = fit > 0 && lines.length > 0;
  const leadNode = (
    <Lead occurrence={occurrence} day={day} now={now} split={split} report={false} />
  );
  if (split) {
    return (
      <View className="flex-1 flex-row gap-4">
        {leadNode}
        {shown ? <View className="w-px self-stretch bg-outline-variant" /> : null}
        {shown ? <DayRows lines={lines} fit={fit} className="flex-1" /> : null}
      </View>
    );
  }
  return (
    <View className="flex-1 gap-3">
      {leadNode}
      {shown ? <DayRows lines={lines} fit={fit} className="flex-1" /> : null}
      {tall ? <TallStrip day={day} /> : null}
    </View>
  );
}

function TallStrip({ day }: { readonly day: PlannerDay }): ReactNode {
  return <DayStrip model={useStripModel(day)} compact />;
}

function UpNextDay({
  day,
  offline,
}: {
  readonly day: PlannerDay;
  readonly offline: boolean;
}): ReactNode {
  const ref = useRef<View>(null);
  const minute = useVisibleMinute(ref);
  const next = lensOf(day, NO_HIDDEN);
  const missed = day.missed.length;
  return (
    <WidgetFrame {...FRAME} badge={offline ? <WidgetOffline /> : <DayBadge day={day} />}>
      <View ref={ref} onLayout={minute.onLayout} className="flex-1">
        {next === null ? (
          <WidgetEmpty
            icon="circleCheck"
            colour={missed === 0 ? 'positive' : 'warning'}
            title={missed === 0 ? 'Nothing left today' : `Nothing left, ${String(missed)} missed`}
            body="New tasks and events show here."
            action={OPEN}
          />
        ) : (
          <UpNextBody day={day} occurrence={next} now={minute.value} />
        )}
      </View>
    </WidgetFrame>
  );
}

function UpNextPending({
  failed,
  offline,
}: {
  readonly failed: boolean;
  readonly offline: boolean;
}): ReactNode {
  if (offline)
    return (
      <WidgetFrame {...FRAME}>
        <WidgetEmpty
          icon="wifi-off"
          colour="warning"
          title="The hub is offline"
          body="Your day shows here once the hub is back."
        />
      </WidgetFrame>
    );
  return (
    <WidgetFrame {...FRAME}>
      {failed ? (
        <WidgetEmpty
          icon="warning"
          colour="critical"
          title="Couldn’t load today"
          body="Open Planner to try again."
          action={OPEN}
        />
      ) : (
        <Skeleton shape="block" className="flex-1" />
      )}
    </WidgetFrame>
  );
}

export function UpNextWidget(): ReactNode {
  const today = useDayKey();
  const query = usePlannerDay(null, today);
  const offline = useHubOffline();
  return query.data === undefined ? (
    <UpNextPending failed={query.isError} offline={offline} />
  ) : (
    <UpNextDay day={query.data} offline={offline} />
  );
}
