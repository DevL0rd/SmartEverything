import type { AutomationRunSummary } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { PAGE_SIZE, ShowMore } from '../../../components/show-more';
import { useMinute } from '../../../store/clock';
import { useAutomations } from '../data/use-automations';
import { useDecisions, useRuns } from '../data/use-runs';
import { DecisionsTab } from './decisions-tab';
import { RunFilters } from './run-filters';
import {
  chartSummary,
  decisionRows,
  filterCounts,
  filterRuns,
  newestFirst,
  runDays,
  type ChartSummary,
  type RunDay,
  type RunFilter,
} from './run-history-model';
import { RunDayGroup } from './run-rows';
import { RunsChart } from './runs-chart';

type Tab = 'runs' | 'why';

const CHART_DAYS = 14;
const TABS = [
  { value: 'runs', label: 'Runs', icon: 'activity' },
  { value: 'why', label: 'Why it did not run', icon: 'ban' },
] as const;

export interface RunsScreenProps {
  readonly automationId: string | null;
  readonly timeZone: string | null;
  readonly onOpenRun: (run: AutomationRunSummary) => void;
}

function toggled(chosen: ReadonlySet<RunFilter>, filter: RunFilter): ReadonlySet<RunFilter> {
  const next = new Set(chosen);
  if (!next.delete(filter)) next.add(filter);
  return next;
}

interface RunListModel {
  readonly summary: ChartSummary;
  readonly counts: Readonly<Record<RunFilter, number>>;
  readonly days: readonly RunDay[];
  readonly remaining: number;
  readonly mostSteps: number;
}

function modelOf(
  runs: readonly AutomationRunSummary[],
  chosen: ReadonlySet<RunFilter>,
  limit: number,
  { now, timeZone }: { readonly now: number; readonly timeZone: string | null },
): RunListModel {
  const shown = newestFirst(filterRuns(runs, chosen));
  return {
    summary: chartSummary(
      runs.filter((run) => run.mode === 'live'),
      now,
      timeZone,
      CHART_DAYS,
    ),
    counts: filterCounts(runs),
    days: runDays(shown.slice(0, limit), timeZone),
    remaining: shown.length - limit,
    mostSteps: Math.max(0, ...shown.map((run) => run.steps)),
  };
}

function Empty({ any }: { readonly any: boolean }): ReactNode {
  return (
    <EmptyState
      icon="activity"
      title={any ? 'No runs match' : 'No runs yet'}
      body={
        any
          ? 'Turn a filter off to see more runs.'
          : 'Runs appear here as soon as an automation starts.'
      }
    />
  );
}

function RunList({
  runs,
  automationId,
  timeZone,
  onOpenRun,
}: RunsScreenProps & { readonly runs: readonly AutomationRunSummary[] }): ReactNode {
  const now = useMinute();
  const { byId } = useAutomations();
  const [chosen, setChosen] = useState<ReadonlySet<RunFilter>>(new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const model = useMemo(
    () => modelOf(runs, chosen, limit, { now, timeZone }),
    [runs, chosen, limit, now, timeZone],
  );
  const nameOf = (run: AutomationRunSummary): string | null =>
    automationId === null ? (byId.get(run.automation_id)?.name ?? 'A removed automation') : null;
  return (
    <View className="gap-section-gap">
      <RunsChart summary={model.summary} />
      <RunFilters
        chosen={chosen}
        counts={model.counts}
        onToggle={(filter) => {
          setChosen((current) => toggled(current, filter));
          setLimit(PAGE_SIZE);
        }}
      />
      {model.days.length === 0 ? <Empty any={runs.length > 0} /> : null}
      {model.days.map((day) => (
        <RunDayGroup
          key={day.key}
          day={day}
          now={now}
          zone={timeZone}
          mostSteps={model.mostSteps}
          nameOf={nameOf}
          onOpen={onOpenRun}
        />
      ))}
      <ShowMore
        remaining={model.remaining}
        onPress={() => {
          setLimit(limit + PAGE_SIZE);
        }}
      />
    </View>
  );
}

function Decisions({ automationId }: { readonly automationId: string }): ReactNode {
  const query = useDecisions(automationId);
  const now = useMinute();
  return (
    <LoadedQuery query={query}>
      {(decisions) => <DecisionsTab rows={decisionRows(decisions, now)} />}
    </LoadedQuery>
  );
}

export function RunsScreen(props: RunsScreenProps): ReactNode {
  const { automationId } = props;
  const [tab, setTab] = useState<Tab>('runs');
  const query = useRuns(automationId);
  return (
    <View className="gap-section-gap">
      {automationId === null ? null : (
        <Segmented options={TABS} value={tab} onChange={setTab} label="Run history view" />
      )}
      {tab === 'why' && automationId !== null ? (
        <Decisions automationId={automationId} />
      ) : (
        <LoadedQuery query={query}>{(runs) => <RunList {...props} runs={runs} />}</LoadedQuery>
      )}
    </View>
  );
}
