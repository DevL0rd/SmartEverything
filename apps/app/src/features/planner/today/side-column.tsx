import {
  weatherKindOf,
  weatherLabelOf,
  type PlannerDay,
  type PlannerTimerRow,
  type WeatherForecast,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc, Bars } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { decimal, percent } from '../../../format/number';
import {
  MINUTE_MS,
  clock,
  dayBoundsOf,
  dayLabel,
  hoursMinutes,
  playTime,
} from '../../../format/time';
import { useMinute, useSecondOf } from '../../../store/clock';
import { askAssistantWith } from '../../assistant';
import { useWeather } from '../../weather';
import { conditionIcon, degrees } from '../../weather/model/present';
import {
  usePlannerClockWrites,
  usePlannerPreferences,
  usePlannerStats,
  usePlannerTimers,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import {
  liveTimersOf,
  onTimeOf,
  planPromptOf,
  rainBarsOf,
  timerLeftMs,
  type PlanPrompt,
  type TodayRing,
} from './day-strip-model';
import { TodayRings, useTodayRings } from './today-rings';

export type SideLayout = 'column' | 'grid';

const WET: ReadonlySet<string> = new Set(['drizzle', 'rain', 'snow', 'storm']);

function Cell({
  grid,
  children,
}: {
  readonly grid: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return <View className={cn(grid && 'min-w-64 flex-1')}>{children}</View>;
}

function failed(message: string): (error: unknown) => void {
  return (error: unknown): void => {
    notify({ message, error, tone: 'critical' });
  };
}

function OnTimeBars(): ReactNode {
  const { person } = usePlannerFrame();
  const stats = usePlannerStats(person, 'week').data;
  if (stats === undefined) return null;
  const model = onTimeOf(stats);
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant">
          Done on time, last 7 days
        </Text>
        <Text variant="caption" tone="positive" className="tabular">
          {model.label}
        </Text>
      </View>
      <Bars
        bars={model.bars}
        colour="primary"
        label={`Daily completion, ${model.label}`}
        height={44}
        highlightKey={model.today}
        formatValue={percent}
      />
    </View>
  );
}

function RingsCard({
  rings,
  layout,
}: {
  readonly rings: readonly TodayRing[];
  readonly layout: SideLayout;
}): ReactNode {
  return (
    <Cell grid={layout === 'grid'}>
      <Card>
        {layout === 'column' ? <Text variant="label">Today</Text> : null}
        <TodayRings rings={rings} size={layout === 'column' ? 'card' : 'grid'} />
        {layout === 'column' ? (
          <>
            <View className="h-hairline bg-outline-variant" />
            <OnTimeBars />
          </>
        ) : null}
      </Card>
    </Cell>
  );
}

function changeOf(forecast: WeatherForecast, now: number): string | null {
  const nowWet = WET.has(weatherKindOf(forecast.now.code));
  const next = forecast.hourly.find(
    (hour) => Date.parse(hour.at) > now && WET.has(weatherKindOf(hour.code)) !== nowWet,
  );
  if (next === undefined) return null;
  const label = nowWet ? 'Dry' : weatherLabelOf(next.code);
  return `${label} from ${clock(next.at, forecast.timeZone)}`;
}

function RainBars({
  forecast,
  day,
}: {
  readonly forecast: WeatherForecast;
  readonly day: PlannerDay;
}): ReactNode {
  const now = useMinute();
  const bars = rainBarsOf(forecast.hourly, now, dayBoundsOf(day.date, day.time_zone).end);
  if (bars.length === 0) return null;
  return (
    <View className="w-20">
      <Bars
        bars={bars}
        colour="viz-6"
        label="Rain for the rest of today"
        height={28}
        formatValue={(value) => `${decimal(value, 1)} mm`}
      />
    </View>
  );
}

function WeatherCard({
  day,
  grid,
}: {
  readonly day: PlannerDay;
  readonly grid: boolean;
}): ReactNode {
  const { person } = usePlannerFrame();
  const preferences = usePlannerPreferences(person).data;
  const view = useWeather();
  const now = useMinute();
  if (view.kind !== 'ready' || preferences?.day_planner.show_weather !== true) return null;
  const { forecast } = view;
  const change = changeOf(forecast, now);
  return (
    <Cell grid={grid}>
      <Card href={href.weather()} label="Open weather">
        <View className="flex-row items-center gap-3">
          <Icon name={conditionIcon(forecast.now.code, forecast.now.isDay)} size={28} />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-baseline gap-2">
              <Figure value={degrees(forecast.now.temperatureC)} size="s" />
              <Text variant="footnote" numberOfLines={1}>
                {weatherLabelOf(forecast.now.code)}
              </Text>
            </View>
            {change === null ? null : (
              <Text variant="caption" tone="variant" numberOfLines={1}>
                {change}
              </Text>
            )}
          </View>
          <RainBars forecast={forecast} day={day} />
        </View>
      </Card>
    </Cell>
  );
}

function AlarmCard({ day, grid }: { readonly day: PlannerDay; readonly grid: boolean }): ReactNode {
  const now = useMinute();
  if (day.next_alarm_at === null) return null;
  const at = day.next_alarm_at;
  const minutes = Math.max(0, Math.round((Date.parse(at) - now) / MINUTE_MS));
  return (
    <Cell grid={grid}>
      <Card>
        <View className="flex-row items-center gap-3">
          <IconWell icon="alarmClock" colour="primary" />
          <View className="min-w-0 flex-1">
            <Figure value={clock(at, day.time_zone)} size="s" />
            <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
              {`${dayLabel(at, now, day.time_zone)} · in ${hoursMinutes(minutes)}`}
            </Text>
          </View>
          <IconButton icon="chevronRight" label="Open in Clock" href={href.clock.alarms()} />
        </View>
      </Card>
    </Cell>
  );
}

interface TimerActions {
  readonly offline: boolean;
  readonly toggle: () => void;
  readonly addMinute: () => void;
}

function useTimerActions(timer: PlannerTimerRow, running: boolean): TimerActions {
  const { person, offline } = usePlannerFrame();
  const writes = usePlannerClockWrites(person);
  return {
    offline,
    toggle: (): void => {
      background(
        writes
          .actOnTimer(timer.id, running ? 'pause' : 'resume')
          .catch(failed('Couldn’t change the timer')),
        'planner.timer_action_failed',
      );
    },
    addMinute: (): void => {
      background(
        writes.addTimerTime(timer.id, MINUTE_MS).catch(failed('Couldn’t add a minute')),
        'planner.timer_add_failed',
      );
    },
  };
}

function TimerCard({
  timer,
  grid,
}: {
  readonly timer: PlannerTimerRow;
  readonly grid: boolean;
}): ReactNode {
  const running = timer.state === 'running';
  const left = useSecondOf((now) => timerLeftMs(timer, now) ?? 0, running);
  const { offline, toggle, addMinute } = useTimerActions(timer, running);
  const name = timer.label ?? 'Timer';
  return (
    <Cell grid={grid}>
      <Card>
        <View className="flex-row items-center gap-3">
          <View accessible accessibilityLabel={`${name}, ${playTime(left / 1000)} left`}>
            <Arc
              value={Math.min(1, left / timer.duration_ms)}
              size={40}
              thickness={4}
              colour="primary"
            />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="footnote" tone="variant" className="font-mono tabular">
              {`${playTime(left / 1000)} ${running ? 'left' : 'paused'}`}
            </Text>
          </View>
          <IconButton
            icon={running ? 'pause' : 'play'}
            label={running ? 'Pause' : 'Resume'}
            variant="tonal"
            onPress={toggle}
            disabled={offline}
          />
          <IconButton icon="plus" label="Add one minute" onPress={addMinute} disabled={offline} />
        </View>
      </Card>
    </Cell>
  );
}

function planText(prompt: PlanPrompt, timeZone: string): string {
  const tasks = `${String(prompt.tasks)} open ${prompt.tasks === 1 ? 'task' : 'tasks'}`;
  const slots = `${String(prompt.slots)} free ${prompt.slots === 1 ? 'slot' : 'slots'}`;
  return `${tasks} and ${slots} before ${clock(prompt.until, timeZone)}. Nothing moves until you accept.`;
}

function PlanCard({ day, grid }: { readonly day: PlannerDay; readonly grid: boolean }): ReactNode {
  const now = useMinute();
  const [hidden, setHidden] = useState(false);
  const prompt = planPromptOf(day, now);
  if (prompt === null || hidden) return null;
  const ask = (): void => {
    askAssistantWith(
      `Plan the rest of today: propose times for my ${String(prompt.tasks)} open tasks in my free slots before ${clock(prompt.until, day.time_zone)}. Only propose; don't book anything until I accept.`,
    );
  };
  return (
    <Cell grid={grid}>
      <Card className="bg-primary-container/40">
        <View className="flex-row items-center gap-2">
          <Icon name="sparkles" size={16} tone="primary" />
          <Text variant="label">Plan the rest of today</Text>
        </View>
        <Text variant="footnote" tone="variant">
          {planText(prompt, day.time_zone)}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button label="Show plan" variant="tonal" onPress={ask} />
          <Button
            label="Not now"
            variant="text"
            onPress={() => {
              setHidden(true);
            }}
          />
        </View>
      </Card>
    </Cell>
  );
}

export function TodaySideColumn({
  day,
  move,
  layout,
}: {
  readonly day: PlannerDay;
  readonly move: number | null;
  readonly layout: SideLayout;
}): ReactNode {
  const { person } = usePlannerFrame();
  const rings = useTodayRings(day, move);
  const timers = liveTimersOf(usePlannerTimers(person));
  const grid = layout === 'grid';
  return (
    <View className={cn(grid ? 'flex-row flex-wrap gap-3' : 'w-84 gap-4')}>
      <RingsCard rings={rings} layout={layout} />
      <WeatherCard day={day} grid={grid} />
      <AlarmCard day={day} grid={grid} />
      {timers.map((timer) => (
        <TimerCard key={timer.id} timer={timer} grid={grid} />
      ))}
      <PlanCard day={day} grid={grid} />
    </View>
  );
}
