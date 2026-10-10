import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { localClock, type Place, type ScheduleRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { DateNav } from '../../../components/date-nav';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock, localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { scheduledOf, useAutomationsPage, type RuleView } from '../data/use-automations';
import { dayWindow, upcomingRuns, type Upcoming } from '../model/schedule';
import { useScheduledRows } from '../scheduled/use-scheduled';
import { upcomingOf } from '../scheduled/view';
import { oneOffRuns, type OneOff } from '../scheduled/week';

const WEEK = 7;

function dateOf(day: Date, timeZone: string): string {
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  });
}

interface Day {
  readonly key: string;
  readonly start: Date;
  readonly runs: readonly Upcoming[];
  readonly oneOffs: readonly OneOff[];
}

function weekOf(
  value: Date,
  rules: readonly RuleView[],
  scheduled: readonly ScheduleRow[],
  place: Place,
): Day[] {
  const weekday = localClock(value, place.timeZone).weekday;
  const back = -((weekday + 6) % WEEK);
  const runs = upcomingRuns(
    rules.map((rule) => ({ id: rule.row.id, name: rule.row.name, scheduled: scheduledOf(rule) })),
    dayWindow(value, place.timeZone, back, WEEK),
    place,
  );
  const oneOffs = oneOffRuns(scheduled, dayWindow(value, place.timeZone, back, WEEK));
  return Array.from({ length: WEEK }, (_, index) => {
    const start = dayWindow(value, place.timeZone, back + index).start;
    const key = localDayKey(start, place.timeZone);
    const onDay = (run: { readonly at: Date }): boolean =>
      localDayKey(run.at, place.timeZone) === key;
    return { key, start, runs: runs.filter(onDay), oneOffs: oneOffs.filter(onDay) };
  });
}

function RunLine({ run, place }: { readonly run: Upcoming; readonly place: Place }): ReactNode {
  return (
    <Interactive
      href={href.automation(run.automationId)}
      label={`${run.name} at ${clock(run.at, place.timeZone)}`}
      className="min-h-touch-min flex-row items-center gap-3 rounded-md px-2"
      layerClassName="rounded-md"
    >
      <Text variant="label" tone="primary">
        {clock(run.at, place.timeZone)}
      </Text>
      <Text variant="body" numberOfLines={1} className="flex-1">
        {run.name}
      </Text>
    </Interactive>
  );
}

function OneOffLine({ run, place }: { readonly run: OneOff; readonly place: Place }): ReactNode {
  return (
    <Interactive
      href={href.scheduledItem(run.scheduleId)}
      label={`Once: ${run.title} at ${clock(run.at, place.timeZone)}`}
      className="min-h-touch-min flex-row items-center gap-3 rounded-md px-2"
      layerClassName="rounded-md"
    >
      <Text variant="label" tone="variant">
        {clock(run.at, place.timeZone)}
      </Text>
      <Icon name="timer" size={16} tone="variant" />
      <Text variant="body" tone="variant" numberOfLines={1} className="flex-1">
        {run.title}
      </Text>
    </Interactive>
  );
}

function DayCard({
  day,
  place,
  now,
}: {
  readonly day: Day;
  readonly place: Place;
  readonly now: number;
}): ReactNode {
  const today = day.key === localDayKey(new Date(now), place.timeZone);
  return (
    <Card padding="none" className={cn('gap-1 p-3', today && 'border border-primary')}>
      <Text variant="title-3" tone={today ? 'primary' : 'default'} className="px-2">
        {today ? `Today · ${dateOf(day.start, place.timeZone)}` : dateOf(day.start, place.timeZone)}
      </Text>
      {day.runs.length + day.oneOffs.length === 0 ? (
        <Text variant="callout" tone="faint" className="px-2 py-2">
          Nothing planned
        </Text>
      ) : (
        <View>
          {day.runs.map((run) => (
            <RunLine key={run.key} run={run} place={place} />
          ))}
          {day.oneOffs.map((run) => (
            <OneOffLine key={run.key} run={run} place={place} />
          ))}
        </View>
      )}
    </Card>
  );
}

function Week({
  rules,
  place,
}: {
  readonly rules: readonly RuleView[];
  readonly place: Place;
}): ReactNode {
  const now = useMinute();
  const scheduled = useScheduledRows();
  const [value, setValue] = useState(() => new Date(now));
  return (
    <>
      <DateNav value={value} range="week" onChange={setValue} />
      <Grid minItemWidth={180}>
        {weekOf(value, rules, scheduled, place).map((day) => (
          <DayCard key={day.key} day={day} place={place} now={now} />
        ))}
      </Grid>
    </>
  );
}

function ScheduleBody({
  page,
}: {
  readonly page: ReturnType<typeof useAutomationsPage>;
}): ReactNode {
  const timed = page.rules.filter((rule) => rule.section === 'scheduled');
  const scheduled = useScheduledRows();
  if (!page.reading.usable) {
    return (
      <EmptyState
        icon="clock"
        title="Set your home’s time zone"
        body="The schedule needs it."
        action={<Button label="Set time zone" href={href.settings.page('home/location')} />}
      />
    );
  }
  if (timed.length === 0 && upcomingOf(scheduled).length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing scheduled"
        body="Automations that run at set times, and things scheduled once, show up here."
      />
    );
  }
  return <Week rules={timed} place={page.reading.place} />;
}

export function ScheduleScreen(): ReactNode {
  const page = useAutomationsPage();
  return (
    <Screen maxWidth="dashboard" header={<PageHeader title="Schedule" />}>
      <ScheduleBody page={page} />
    </Screen>
  );
}
