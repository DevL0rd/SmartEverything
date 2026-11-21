import type { AutomationRunSummary } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { PAGE_SIZE, ShowMore } from '../../../components/show-more';
import { TabsBar } from '../../../components/tabs-bar';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useMinute } from '../../../store/clock';
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
import { RunDayGroup, type RunDayGroupProps } from './run-rows';
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
  readonly counts: Readonly<Record<RunFilter, number>>;
  readonly days: readonly RunDay[];
  readonly remaining: number;
  readonly mostSteps: number;
}

function modelOf(
  runs: readonly AutomationRunSummary[],
  chosen: ReadonlySet<RunFilter>,
  limit: number,
  timeZone: string | null,
): RunListModel {
  const shown = newestFirst(filterRuns(runs, chosen));
  return {
    counts: filterCounts(runs),
    days: runDays(shown.slice(0, limit), timeZone),
    remaining: shown.length - limit,
    mostSteps: Math.max(0, ...shown.map((run) => run.steps)),
  };
}

function summaryOf(
  runs: readonly AutomationRunSummary[],
  now: number,
  timeZone: string | null,
): ChartSummary {
  return chartSummary(
    runs.filter((run) => run.mode === 'live'),
    now,
    timeZone,
    CHART_DAYS,
  );
}

function Empty({ any }: { readonly any: boolean }): ReactNode {
  return (
    <View className="w-full">
      <EmptyState
        icon="activity"
        title={any ? 'No runs match' : 'No runs yet'}
        body={
          any
            ? 'Turn a filter off to see more runs.'
            : 'Runs appear here as soon as an automation starts.'
        }
      />
    </View>
  );
}

function RunDays({
  any,
  days,
  now,
  zone,
  mostSteps,
  named,
  onOpen,
}: Omit<RunDayGroupProps, 'day' | 'width'> & {
  readonly any: boolean;
  readonly days: readonly RunDay[];
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  if (days.length === 0) return <Empty any={any} />;
  return (
    <View className="gap-section-gap" onLayout={onLayout}>
      {days.map((day) => (
        <RunDayGroup
          key={day.key}
          day={day}
          width={width}
          now={now}
          zone={zone}
          mostSteps={mostSteps}
          named={named}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function RunList(
  props: RunsScreenProps & { readonly runs: readonly AutomationRunSummary[] },
): ReactNode {
  const { runs, automationId, timeZone, onOpenRun } = props;
  const now = useMinute();
  const [chosen, setChosen] = useState<ReadonlySet<RunFilter>>(new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const model = useMemo(
    () => modelOf(runs, chosen, limit, timeZone),
    [runs, chosen, limit, timeZone],
  );
  const summary = useMemo(() => summaryOf(runs, now, timeZone), [runs, now, timeZone]);
  const showMore = (): void => {
    setLimit(limit + PAGE_SIZE);
  };
  return (
    <View className="gap-section-gap">
      <View className="w-full">
        <RunsChart summary={summary} />
      </View>
      <View className="w-full">
        <RunFilters
          chosen={chosen}
          counts={model.counts}
          onToggle={(filter) => {
            setChosen((current) => toggled(current, filter));
            setLimit(PAGE_SIZE);
          }}
        />
      </View>
      <RunDays
        any={runs.length > 0}
        days={model.days}
        now={now}
        zone={timeZone}
        mostSteps={model.mostSteps}
        named={automationId === null}
        onOpen={onOpenRun}
      />
      {model.remaining > 0 ? (
        <View className="w-full">
          <ShowMore remaining={model.remaining} onPress={showMore} />
        </View>
      ) : null}
    </View>
  );
}

function Decisions({ automationId }: { readonly automationId: string }): ReactNode {
  const query = useDecisions(automationId);
  const now = useMinute();
  return (
    <View className="w-full">
      <LoadedQuery query={query}>
        {(decisions) => <DecisionsTab rows={decisionRows(decisions, now)} />}
      </LoadedQuery>
    </View>
  );
}

export function RunsScreen(props: RunsScreenProps): ReactNode {
  const { automationId } = props;
  const [tab, setTab] = useState<Tab>('runs');
  const query = useRuns(automationId);
  return (
    <View className="gap-section-gap">
      {automationId === null ? null : (
        <TabsBar
          items={TABS.map(({ value, label, icon }) => ({
            key: value,
            label,
            icon,
            onPress: (): void => {
              setTab(value);
            },
          }))}
          active={tab}
          label="Runs view"
          compact
        />
      )}
      {tab === 'why' && automationId !== null ? (
        <Decisions automationId={automationId} />
      ) : (
        <LoadedQuery query={query}>{(runs) => <RunList {...props} runs={runs} />}</LoadedQuery>
      )}
    </View>
  );
}
