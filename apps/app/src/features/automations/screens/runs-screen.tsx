import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { dayLabel, localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRow } from '../../../store/selectors';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { useRunEvents, type RunEvents } from '../data/use-run-events';
import { RunRow, useRunSheet } from '../components/runs';
import { usePlaceReading } from '../data/use-automations';
import { runsOf, type Run } from '../model/history';
import { NotFound } from './not-found';

interface Day {
  readonly key: string;
  readonly first: Run;
  readonly runs: readonly Run[];
}

function daysOf(runs: readonly Run[], timeZone: string | null): Day[] {
  const days: Day[] = [];
  for (const run of runs) {
    const key = localDayKey(run.at, timeZone);
    const last = days.at(-1);
    if (last?.key === key) {
      days[days.length - 1] = { ...last, runs: [...last.runs, run] };
    } else {
      days.push({ key, first: run, runs: [run] });
    }
  }
  return days;
}

function RunDays({
  runs,
  zone,
  onOpen,
}: {
  readonly runs: readonly Run[];
  readonly zone: string | null;
  readonly onOpen: (run: Run) => void;
}): ReactNode {
  const now = useMinute();
  return (
    <>
      {daysOf(runs, zone).map((day) => (
        <List key={day.key} title={dayLabel(day.first.at, now, zone)} inset>
          {day.runs.map((run) => (
            <RunRow key={run.id} run={run} timeZone={zone} onOpen={onOpen} />
          ))}
        </List>
      ))}
    </>
  );
}

function RunsBody({
  source,
  runs,
  zone,
  onOpen,
}: {
  readonly source: RunEvents;
  readonly runs: readonly Run[];
  readonly zone: string | null;
  readonly onOpen: (run: Run) => void;
}): ReactNode {
  if (source.error !== null && runs.length === 0) {
    return <ErrorState error={source.error} retry={source.retry} />;
  }
  if (source.loading && runs.length === 0) {
    return <Skeleton shape="block" className="h-40" />;
  }
  if (runs.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="Nothing has run yet"
        body="Runs show up here as they happen."
      />
    );
  }
  return (
    <>
      <RunDays runs={runs} zone={zone} onOpen={onOpen} />
      {source.more === null ? null : (
        <Button
          label="Show older"
          variant="tonal"
          loading={source.loadingMore}
          onPress={source.more}
        />
      )}
    </>
  );
}

function RunsPage({
  title,
  automationId,
}: {
  readonly title: string;
  readonly automationId: string | null;
}): ReactNode {
  const source = useRunEvents();
  const reading = usePlaceReading();
  const zone = reading.usable ? reading.place.timeZone : null;
  const runs = runsOf(source.events, automationId);
  const sheet = useRunSheet(source.events, zone);
  return (
    <Screen maxWidth="reading" header={<PageHeader title={title} />}>
      <RunsBody source={source} runs={runs} zone={zone} onOpen={sheet.open} />
      {sheet.sheet}
    </Screen>
  );
}

const PARAMS = z.object({ automationId: z.string() });

function OneAutomationRuns({ automationId }: { readonly automationId: string }): ReactNode {
  const row = useRow('automations', automationId);
  return (
    <RunsPage
      title={row === null ? 'Run history' : `${row.name} runs`}
      automationId={automationId}
    />
  );
}

export function AutomationRunsScreen(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <OneAutomationRuns automationId={params.data.automationId} />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}

export function AllRunsScreen(): ReactNode {
  return <RunsPage title="Run history" automationId={null} />;
}
