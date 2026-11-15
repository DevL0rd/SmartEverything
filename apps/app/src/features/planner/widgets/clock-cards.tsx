import type { PlannerAlarmRow, PlannerRingRow, PlannerTimerRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Figure } from '../../../components/figure';
import { IconButton } from '../../../components/icon-button';
import { Skeleton } from '../../../components/skeleton';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetGone,
  widgetBodyHeight,
} from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSettings } from '../../../store/selectors';
import {
  ringWindowOf,
  timerLineOf,
  timerViewsOf,
  useHubOffline,
  useTimerActions,
  timersSubtitleOf,
  type TimerView,
  TimerDial,
} from '../../clock';
import {
  alarmLabelOf,
  countdownOf,
  dayWordOf,
  nextRingTextOf,
  type NextRing,
} from '../clock/alarm-text';
import {
  ringsQuery,
  usePlannerAlarms,
  usePlannerTimers,
  usePlannerWrites,
  useVisibleMinute,
} from '../data';
import {
  DIAL_GAP,
  DIAL_SIZE,
  LINE_GAP,
  SECTION_GAP,
  dayTokenOf,
  dialBlockOf,
  dialsFit,
  halfWidthOf,
  linesFit,
  nextAlarmHeightOf,
  ringsInOrderOf,
  rowLineOf,
} from './home-fit';
import { WidgetOffline } from './home-cards';
import { TimerDials, timerTitleOf } from './timer-dials';

const NO_RINGS: readonly PlannerRingRow[] = [];

const FRAME = {
  title: 'Clock',
  icon: 'alarmClock',
  accent: 'primary',
  href: href.clock.alarms(),
} as const;

const ALARM_FRAME = { ...FRAME, title: 'Alarm' } as const;

const TIMER_FRAME = {
  title: 'Timer',
  icon: 'timer',
  accent: 'primary',
  href: href.clock.timers(),
} as const;

const DIVIDER = 1;

const GONE_BODY = 'It was deleted, or it belongs to someone else.';

function AlarmFace({ alarm }: { readonly alarm: PlannerAlarmRow }): ReactNode {
  const offline = useHubOffline();
  const timeZone = useSettings().time_zone;
  const writes = usePlannerWrites(null);
  const ref = useRef<View>(null);
  const minute = useVisibleMinute(ref);
  const label = alarmLabelOf(alarm);
  return (
    <WidgetFrame {...ALARM_FRAME} badge={offline ? <WidgetOffline /> : null}>
      <View ref={ref} onLayout={minute.onLayout} className="flex-1 flex-row items-center gap-4">
        <Figure value={alarm.time} size="m" tone={alarm.enabled ? 'default' : 'variant'} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {nextRingTextOf(alarm, minute.value, timeZone)}
          </Text>
        </View>
        <Switch
          value={alarm.enabled}
          onChange={(enabled) => {
            background(
              writes
                .updateAlarm(alarm, { enabled })
                .catch(notifyFailure('Couldn’t change that alarm')),
              'clock.alarm_widget_failed',
            );
          }}
          label={`Alarm ${alarm.time} ${label}`}
          disabled={offline}
        />
      </View>
    </WidgetFrame>
  );
}

export function PlannerAlarmWidget({ id }: { readonly id: string }): ReactNode {
  const alarm = usePlannerAlarms(null).find((value) => value.id === id);
  return alarm === undefined ? (
    <WidgetGone icon="alarmClock" title="This alarm is gone" body={GONE_BODY} />
  ) : (
    <AlarmFace alarm={alarm} />
  );
}

function TimerButton({ view }: { readonly view: TimerView }): ReactNode {
  const { offline, act } = useTimerActions(view.timer);
  if (view.phase === 'ringing')
    return (
      <IconButton
        icon="close"
        label="Dismiss timer"
        variant="filled"
        disabled={offline}
        onPress={() => {
          act('cancel');
        }}
      />
    );
  const running = view.phase === 'running';
  return (
    <IconButton
      icon={running ? 'pause' : 'play'}
      label={running ? 'Pause' : 'Resume'}
      variant={running ? 'tonal' : 'filled'}
      disabled={offline}
      onPress={() => {
        act(running ? 'pause' : 'resume');
      }}
    />
  );
}

function TimerFace({ view }: { readonly view: TimerView }): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <TimerDial view={view} size="row" />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 shrink">
            {timerTitleOf(view.timer)}
          </Text>
          {view.phase === 'paused' ? <Badge label="Paused" /> : null}
          {view.phase === 'ringing' ? <Badge label="Ringing" tone="primary" icon="bell" /> : null}
        </View>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {timerLineOf(view)}
        </Text>
      </View>
      <TimerButton view={view} />
    </View>
  );
}

function TimerBody({
  timer,
  rings,
}: {
  readonly timer: PlannerTimerRow;
  readonly rings: readonly PlannerRingRow[];
}): ReactNode {
  const view = timerViewsOf([timer], rings)[0];
  return view === undefined ? (
    <WidgetEmpty
      icon="timer"
      colour="primary"
      title={timerTitleOf(timer)}
      body={timer.state === 'cancelled' ? 'Cancelled' : 'Finished'}
    />
  ) : (
    <TimerFace view={view} />
  );
}

function TimerRings({ timer }: { readonly timer: PlannerTimerRow }): ReactNode {
  const span = ringWindowOf([timer]);
  const query = useScreenQuery({
    ...ringsQuery(null, span?.from ?? '', span?.to ?? ''),
    enabled: span !== null,
  });
  if (span === null) return <TimerBody timer={timer} rings={NO_RINGS} />;
  if (query.data !== undefined) return <TimerBody timer={timer} rings={query.data} />;
  return query.isError ? (
    <WidgetEmpty
      icon="warning"
      colour="critical"
      title="Couldn’t load this timer"
      body="Open Timers to try again."
      action={{ label: 'Open Timers', href: TIMER_FRAME.href }}
    />
  ) : (
    <Skeleton shape="block" className="flex-1" />
  );
}

export function PlannerTimerWidget({ id }: { readonly id: string }): ReactNode {
  const timer = usePlannerTimers(null).find((value) => value.id === id);
  const offline = useHubOffline();
  return timer === undefined ? (
    <WidgetGone icon="timer" title="This timer is gone" body={GONE_BODY} />
  ) : (
    <WidgetFrame {...TIMER_FRAME} badge={offline ? <WidgetOffline /> : null}>
      <TimerRings timer={timer} />
    </WidgetFrame>
  );
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
      <View className="min-w-0 flex-1 justify-center gap-0.5">
        <Text variant="body-strong" numberOfLines={1}>
          No alarm on
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          Set one in Clock
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
          <Text variant="footnote" className="w-11 shrink-0 font-mono tabular">
            {ring.alarm.time}
          </Text>
          <Text variant="footnote" tone="variant" className="min-w-9 shrink-0">
            {dayTokenOf(ring.at, now, timeZone)}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
            {alarmLabelOf(ring.alarm)}
          </Text>
        </View>
      ))}
    </View>
  );
}

interface ClockFaceProps {
  readonly next: NextRing | undefined;
  readonly views: readonly TimerView[];
  readonly later: readonly NextRing[];
  readonly now: number;
  readonly timeZone: string;
}

function Divider(): ReactNode {
  return <View className="w-px self-stretch bg-outline-variant" />;
}

function ClockSplit({ next, views, later, now, timeZone }: ClockFaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const body = widgetBodyHeight(frame);
  const lines = linesFit(body, rowLineOf(frame.idiom), LINE_GAP);
  const side =
    views.length > 0 ? (
      <TimerDials views={views} count={dialsFit(halfWidthOf(frame.width), body, frame.idiom)} />
    ) : lines === 0 || later.length === 0 ? null : (
      <LaterAlarms rings={later} count={lines} now={now} timeZone={timeZone} />
    );
  return (
    <View className="flex-1 flex-row gap-4">
      <NextAlarm ring={next} now={now} timeZone={timeZone} />
      {side === null ? null : <Divider />}
      {side}
    </View>
  );
}

function ClockReport({ next, views, later, now, timeZone }: ClockFaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const top = Math.max(
    nextAlarmHeightOf(frame.idiom),
    views.length === 0 ? 0 : dialBlockOf(frame.idiom),
  );
  const body = widgetBodyHeight(frame);
  const room = body - top - 2 * SECTION_GAP - DIVIDER;
  const lines = linesFit(room, rowLineOf(frame.idiom), LINE_GAP);
  const alone = lines === 0 || later.length === 0;
  const dials = alone
    ? dialsFit(halfWidthOf(frame.width), body, frame.idiom)
    : linesFit(halfWidthOf(frame.width), DIAL_SIZE, DIAL_GAP);
  return (
    <View className="flex-1 gap-3">
      <View className={alone ? 'flex-1 flex-row items-start gap-4' : 'flex-row gap-4'}>
        <NextAlarm ring={next} now={now} timeZone={timeZone} />
        {views.length === 0 ? null : <Divider />}
        {views.length === 0 ? null : <TimerDials views={views} count={dials} />}
      </View>
      {alone ? null : (
        <View className="gap-3 border-t border-outline-variant pt-3">
          <LaterAlarms rings={later} count={lines} now={now} timeZone={timeZone} />
        </View>
      )}
    </View>
  );
}

function badgeOf(offline: boolean, views: readonly TimerView[]): ReactNode {
  if (offline) return <WidgetOffline />;
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
  const { cls } = useWidgetFace();
  const ref = useRef<View>(null);
  const minute = useVisibleMinute(ref);
  const [next, ...later] = ringsInOrderOf(alarms, minute.value, timeZone);
  const views = timerViewsOf(timers, NO_RINGS);
  const face = { next, views, later, now: minute.value, timeZone };
  return (
    <WidgetFrame {...FRAME} badge={badgeOf(offline, views)}>
      <View ref={ref} onLayout={minute.onLayout} className="flex-1">
        {next === undefined && views.length === 0 ? (
          <WidgetEmpty
            icon="alarmClock"
            colour="primary"
            title="No alarms or timers"
            body="Your next alarm and running timers show here."
            action={{ label: 'Open Clock', href: FRAME.href }}
          />
        ) : cls === 'xl' || cls === 'l' ? (
          <ClockReport {...face} />
        ) : (
          <ClockSplit {...face} />
        )}
      </View>
    </WidgetFrame>
  );
}
