import type { PlannerRingRow } from '@smarteverything/domain';
import { router } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { Figure } from '../../../components/figure';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame, widgetBodyHeight } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSettings } from '../../../store/selectors';
import { TimerCard, ringWindowOf, timerViewsOf, useHubOffline } from '../../clock';
import { timerNameOf, timersSubtitleOf, type TimerView } from '../../clock/lap-model';
import { TimerDial } from '../../clock/timer-card';
import { AlarmList } from '../clock/alarm-card';
import { alarmLabelOf, countdownOf, dayWordOf, type NextRing } from '../clock/alarm-text';
import {
  ringsQuery,
  usePlannerAlarms,
  usePlannerPreferences,
  usePlannerTimers,
  useVisibleMinute,
} from '../data';
import { QueryBody } from '../frame/query-body';
import { dialsFit, halfWidthOf, linesFit, rowLineOf, ringsInOrderOf, LINE_GAP } from './home-fit';

const NO_RINGS: readonly PlannerRingRow[] = [];

const FRAME = {
  title: 'Clock',
  icon: 'alarmClock',
  accent: 'primary',
  href: href.clock.alarms(),
} as const;

function openAlarms(): void {
  router.push(href.clock.alarms());
}

export function PlannerAlarmWidget({ id }: { readonly id: string }): ReactNode {
  const alarm = usePlannerAlarms(null).find((value) => value.id === id);
  const query = usePlannerPreferences(null);
  const offline = useHubOffline();
  const timeZone = useSettings().time_zone;
  if (alarm === undefined)
    return (
      <EmptyState
        compact
        icon="alarmClock"
        title="This alarm is gone"
        body="It was deleted, or it belongs to someone else."
      />
    );
  return (
    <QueryBody query={query}>
      {(prefs) => (
        <AlarmList
          person={null}
          alarms={[alarm]}
          timeZone={timeZone}
          weekStart={prefs.general.week_start}
          layout="compact"
          offline={offline}
          onOpen={openAlarms}
        />
      )}
    </QueryBody>
  );
}

export function PlannerTimerWidget({ id }: { readonly id: string }): ReactNode {
  const timer = usePlannerTimers(null).find((value) => value.id === id);
  const timers = timer === undefined ? [] : [timer];
  const span = ringWindowOf(timers);
  const query = useScreenQuery({
    ...ringsQuery(null, span?.from ?? '', span?.to ?? ''),
    enabled: span !== null,
  });
  if (timer === undefined)
    return (
      <EmptyState
        compact
        icon="timer"
        title="This timer is gone"
        body="It was deleted, or it belongs to someone else."
      />
    );
  const shown = (rings: readonly PlannerRingRow[]): ReactNode => {
    const view = timerViewsOf(timers, rings)[0];
    return view === undefined ? (
      <ListRow
        icon="timer"
        title={timer.label ?? 'Timer'}
        subtitle={timer.state === 'cancelled' ? 'Cancelled' : 'Finished'}
      />
    ) : (
      <TimerCard view={view} />
    );
  };
  return span === null ? shown(NO_RINGS) : <QueryBody query={query}>{shown}</QueryBody>;
}

function NextAlarm({
  ring,
  now,
  timeZone,
}: {
  readonly ring: NextRing | undefined;
  readonly now: number;
  readonly timeZone: string;
}): ReactNode {
  if (ring === undefined)
    return (
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          No alarm on
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          Alarms you turn on show here.
        </Text>
      </View>
    );
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {`Next alarm · ${alarmLabelOf(ring.alarm)}`}
      </Text>
      <Figure value={ring.alarm.time} size="m" />
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
        {`${dayWordOf(ring.at, now, timeZone)} · in ${countdownOf(ring.at, now)}`}
      </Text>
    </View>
  );
}

function TimerDials({
  views,
  count,
}: {
  readonly views: readonly TimerView[];
  readonly count: number;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row flex-wrap content-start gap-3">
      {views.slice(0, count).map((view) => (
        <View key={view.timer.id} className="w-14 items-center gap-0.5">
          <TimerDial view={view} size="row" />
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {timerNameOf(view.timer)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LaterAlarms({
  rings,
  count,
  now,
  timeZone,
}: {
  readonly rings: readonly NextRing[];
  readonly count: number;
  readonly now: number;
  readonly timeZone: string;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      {rings.slice(0, count).map((ring) => (
        <View key={ring.alarm.id} className="flex-row items-center gap-2">
          <Text variant="footnote" tone="variant" className="w-11 font-mono tabular">
            {ring.alarm.time}
          </Text>
          <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
            {`${alarmLabelOf(ring.alarm)} · ${dayWordOf(ring.at, now, timeZone)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ClockSide({
  views,
  later,
  now,
  timeZone,
}: {
  readonly views: readonly TimerView[];
  readonly later: readonly NextRing[];
  readonly now: number;
  readonly timeZone: string;
}): ReactNode {
  const { frame } = useWidgetFace();
  const body = widgetBodyHeight(frame);
  if (views.length > 0)
    return (
      <TimerDials views={views} count={dialsFit(halfWidthOf(frame.width), body, frame.idiom)} />
    );
  const count = linesFit(body, rowLineOf(frame.idiom), LINE_GAP);
  return count === 0 || later.length === 0 ? null : (
    <LaterAlarms rings={later} count={count} now={now} timeZone={timeZone} />
  );
}

function Offline(): ReactNode {
  return (
    <Text variant="caption" tone="warning" numberOfLines={1}>
      Hub offline
    </Text>
  );
}

function badgeOf(offline: boolean, views: readonly TimerView[]): ReactNode {
  if (offline) return <Offline />;
  return views.length === 0 ? null : (
    <Text variant="caption" tone="variant" numberOfLines={1}>
      {timersSubtitleOf(views)}
    </Text>
  );
}

export function ClockHomeWidget(): ReactNode {
  const alarms = usePlannerAlarms(null);
  const timers = usePlannerTimers(null);
  const offline = useHubOffline();
  const timeZone = useSettings().time_zone;
  const ref = useRef<View>(null);
  const minute = useVisibleMinute(ref);
  const [next, ...later] = ringsInOrderOf(alarms, minute.value, timeZone);
  const views = timerViewsOf(timers, NO_RINGS);
  const side =
    next === undefined && views.length === 0 ? null : (
      <ClockSide views={views} later={later} now={minute.value} timeZone={timeZone} />
    );
  return (
    <WidgetFrame {...FRAME} badge={badgeOf(offline, views)}>
      <View ref={ref} onLayout={minute.onLayout} className="flex-1 flex-row gap-4">
        {next === undefined && views.length === 0 ? (
          <WidgetEmpty
            icon="alarmClock"
            colour="primary"
            title="No alarms or timers"
            body="Your next alarm and running timers show here."
            action={{ label: 'Open Clock', href: FRAME.href }}
          />
        ) : (
          <>
            <NextAlarm ring={next} now={minute.value} timeZone={timeZone} />
            <View className="w-px self-stretch bg-outline-variant" />
            {side}
          </>
        )}
      </View>
    </WidgetFrame>
  );
}
