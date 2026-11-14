import type { PlannerColourKey, PlannerDay, PlannerOccurrenceView } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Arc } from '../../../components/charts/arc';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame, widgetBodyHeight } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { useDayKey } from '../../../store/clock';
import { useHubOffline } from '../../clock';
import { DeviceFace } from '../../devices';
import { usePlannerCollections, usePlannerDay, usePlannerItems, useVisibleMinute } from '../data';
import { LIST_DOT } from '../item/composer-tokens';
import { lensOf } from '../today/now-lens';
import { riverRowsOf, type RiverRow } from '../today/river-model';
import {
  SECTION_GAP,
  dayCountsOf,
  deviceIdsOf,
  isSplit,
  leadHeightOf,
  leadWhenOf,
  linesFit,
  rowLineOf,
  LINE_GAP,
} from './home-fit';

const FRAME = {
  title: 'Up next',
  icon: 'calendar',
  accent: 'primary',
  href: href.planner.index(),
} as const;

const OPEN = { label: 'Open Planner', href: href.planner.index() } as const;
const NO_HIDDEN: ReadonlySet<string> = new Set();
const RING = { size: 18, thickness: 3 } as const;
const ROW_FADE = ['opacity-100', 'opacity-80', 'opacity-60', 'opacity-45'] as const;

function dotOf(colour: PlannerColourKey | null): string {
  return colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
}

function fadeOf(index: number): string | undefined {
  return ROW_FADE.at(Math.min(index, ROW_FADE.length - 1));
}

function Offline(): ReactNode {
  return (
    <Text variant="caption" tone="warning" numberOfLines={1}>
      Hub offline
    </Text>
  );
}

function DayBadge({ day }: { readonly day: PlannerDay }): ReactNode {
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
      {whole === 0 ? null : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${plural(counts.done, 'thing')} of ${String(whole)} done today`}
        >
          <Arc value={counts.share} size={RING.size} thickness={RING.thickness} colour="primary" />
        </View>
      )}
    </View>
  );
}

function Lead({
  occurrence,
  day,
  now,
  split,
}: {
  readonly occurrence: PlannerOccurrenceView;
  readonly day: PlannerDay;
  readonly now: number;
  readonly split: boolean;
}): ReactNode {
  const devices = deviceIdsOf(occurrence);
  return (
    <View className={cn('min-w-0 gap-1', split && 'flex-1')}>
      <Text variant="body-strong" numberOfLines={1}>
        {occurrence.title}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
        {leadWhenOf(occurrence, day.time_zone, now)}
      </Text>
      {devices.length === 0 ? null : (
        <View className="flex-row gap-2 overflow-hidden">
          {devices.map((deviceId) => (
            <DeviceFace key={deviceId} deviceId={deviceId} face="chip" context="nested" />
          ))}
        </View>
      )}
    </View>
  );
}

function NextRows({
  rows,
  count,
  split,
}: {
  readonly rows: readonly RiverRow[];
  readonly count: number;
  readonly split: boolean;
}): ReactNode {
  return (
    <View className={cn('min-w-0 gap-1', split && 'flex-1')}>
      {rows.slice(0, count).map((row, index) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={row.spoken}
          className="flex-row items-center gap-2"
        >
          <Text
            variant="footnote"
            tone="variant"
            numberOfLines={1}
            className="min-w-11 shrink-0 font-mono tabular"
          >
            {row.time}
          </Text>
          <View className={cn('size-2 rounded-full', dotOf(row.colour), fadeOf(index))} />
          <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
            {row.title}
          </Text>
        </View>
      ))}
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
  const items = usePlannerItems(null);
  const collections = usePlannerCollections(null);
  const rows = riverRowsOf({ day, collections, items, hidden: NO_HIDDEN });
  const split = isSplit(cls);
  const body = widgetBodyHeight(frame);
  const lead = leadHeightOf(frame.idiom, deviceIdsOf(occurrence).length > 0);
  const room = split ? body : body - lead - SECTION_GAP;
  const count = linesFit(room, rowLineOf(frame.idiom), LINE_GAP);
  const shown = count > 0 && rows.length > 0;
  const leadNode = <Lead occurrence={occurrence} day={day} now={now} split={split} />;
  if (split) {
    return (
      <View className="flex-1 flex-row gap-4">
        {leadNode}
        {shown ? <View className="w-px self-stretch bg-outline-variant" /> : null}
        {shown ? <NextRows rows={rows} count={count} split /> : null}
      </View>
    );
  }
  return (
    <View className="flex-1 gap-3">
      {leadNode}
      {shown ? <NextRows rows={rows} count={count} split={false} /> : null}
    </View>
  );
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
    <WidgetFrame {...FRAME} badge={offline ? <Offline /> : <DayBadge day={day} />}>
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
