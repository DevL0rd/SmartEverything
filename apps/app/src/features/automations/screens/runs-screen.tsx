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
import { EditorFocusProvider } from '../editor/editor-focus';
import { FocusedRun } from '../editor/focused-run';
import { OwnedRuns } from '../components/owned-runs';
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

interface RunDaysProps {
  readonly runs: readonly Run[];
  readonly zone: string | null;
  readonly onOpen: (run: Run) => void;
}

function RunDays({ runs, zone, onOpen }: RunDaysProps): ReactNode {
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

interface RunsBodyProps {
  readonly source: RunEvents;
  readonly runs: readonly Run[];
  readonly zone: string | null;
  readonly onOpen: (run: Run) => void;
}

function RunsBody({ source, runs, zone, onOpen }: RunsBodyProps): ReactNode {
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
        title="No legacy run events"
        body="Earlier event records appear separately from owned program runs."
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

interface RunsPageProps {
  readonly title: string;
  readonly automationId: string | null;
}

function RunsPage({ title, automationId }: RunsPageProps): ReactNode {
  const source = useRunEvents();
  const reading = usePlaceReading();
  const zone = reading.usable ? reading.place.timeZone : null;
  const runs = runsOf(source.events, automationId);
  const sheet = useRunSheet(source.events, zone);
  return (
    <EditorFocusProvider>
      <Screen maxWidth="reading" header={<PageHeader title={title} />}>
        <FocusedRun />
        <OwnedRuns
          automationId={automationId}
          {...(automationId === null ? {} : ({ targetType: 'automation' } as const))}
        />
        <RunsBody source={source} runs={runs} zone={zone} onOpen={sheet.open} />
        {sheet.sheet}
      </Screen>
    </EditorFocusProvider>
  );
}

const PARAMS = z.object({ automationId: z.string() });

interface OneAutomationRunsProps {
  readonly automationId: string;
}

function OneAutomationRuns({ automationId }: OneAutomationRunsProps): ReactNode {
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
