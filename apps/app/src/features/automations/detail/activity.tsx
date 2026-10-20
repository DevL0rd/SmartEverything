import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationRunSummary } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import type { Href } from 'expo-router';
import { useMinute } from '../../../store/clock';
import { useRuns } from '../data/use-runs';
import { RunRow } from '../runs/run-rows';
import { RunsChart } from '../runs/runs-chart';
import { activityOf, ACTIVITY_DAYS, type Activity } from './detail-model';

export interface ActivityProps {
  readonly automationId: string;
  readonly timeZone: string | null;
  readonly runsHref: Href;
  readonly onOpenRun: (run: AutomationRunSummary) => void;
}

function Heading({ runsHref }: { readonly runsHref: Href }): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text variant="title-3" accessibilityRole="header">
        {`Activity, last ${String(ACTIVITY_DAYS)} days`}
      </Text>
      <Button label="All runs" variant="text" href={runsHref} />
    </View>
  );
}

function Body({
  activity,
  timeZone,
  onOpenRun,
}: {
  readonly activity: Activity;
  readonly timeZone: string | null;
  readonly onOpenRun: (run: AutomationRunSummary) => void;
}): ReactNode {
  if (activity.recent.length === 0) {
    return (
      <Text variant="body" tone="variant">
        It hasn’t run yet. Runs appear here as soon as it starts.
      </Text>
    );
  }
  return (
    <View className="gap-section-gap">
      <RunsChart summary={activity.summary} />
      <View className="gap-2">
        {activity.recent.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            name={null}
            zone={timeZone}
            mostSteps={activity.mostSteps}
            onOpen={onOpenRun}
          />
        ))}
      </View>
    </View>
  );
}

function Loaded({
  runs,
  timeZone,
  onOpenRun,
}: {
  readonly runs: readonly AutomationRunSummary[];
  readonly timeZone: string | null;
  readonly onOpenRun: (run: AutomationRunSummary) => void;
}): ReactNode {
  const now = useMinute();
  const activity = useMemo(() => activityOf(runs, now, timeZone), [runs, now, timeZone]);
  return <Body activity={activity} timeZone={timeZone} onOpenRun={onOpenRun} />;
}

export function Activity({
  automationId,
  timeZone,
  runsHref,
  onOpenRun,
}: ActivityProps): ReactNode {
  const query = useRuns(automationId);
  return (
    <View className="gap-3">
      <Heading runsHref={runsHref} />
      <LoadedQuery query={query}>
        {(runs) => <Loaded runs={runs} timeZone={timeZone} onOpenRun={onOpenRun} />}
      </LoadedQuery>
    </View>
  );
}
