import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { StageTimeline } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useGoals } from '../data/goals';
import { useLastNight } from '../data/nights';
import { seriesOf } from '../model/catalogue';
import { sleepScore } from '../model/scores';
import { STAGE_LABELS, timelineOf, type SleepNight, type StageKind } from '../model/sleep';
import { clock, hoursMinutes } from '../../../format/time';
import { DetailColumns } from './detail-columns';
import { NoDataRow } from './no-data-row';
import { StatList, type Stat } from './stat-list';
import { useLastDayOf } from '../data/latest-days';

const STAGES: readonly StageKind[] = ['deep', 'light', 'rem', 'awake'];

function nightStats(night: SleepNight, goal: number): readonly Stat[] {
  const score = sleepScore(night, goal);
  const stats: Stat[] = [
    { label: 'In bed', value: `${clock(night.bedtime)} – ${clock(night.wake)}` },
    { label: 'Time in bed', value: hoursMinutes(night.inBedMinutes) },
  ];
  if (score !== null) {
    stats.push({ label: 'Sleep score', value: String(score.value) });
  }
  if (night.hasStages) {
    for (const stage of STAGES) {
      stats.push({ label: STAGE_LABELS[stage], value: hoursMinutes(night.totals[stage]) });
    }
  }
  return stats;
}

function Missing({ day }: { readonly day: string }): ReactNode {
  const lastDay = useLastDayOf(seriesOf('sleep'), day);
  return <NoDataRow what="sleep data" lastDay={lastDay} />;
}

export function NightCard({
  day,
  quiet,
}: {
  readonly day: string;
  readonly quiet: boolean;
}): ReactNode {
  const { night, loaded } = useLastNight(day);
  const goals = useGoals();
  if (!loaded) {
    return <Skeleton shape="block" className="h-56" />;
  }
  if (night === null) {
    return quiet ? null : <Missing day={day} />;
  }
  return (
    <Card title="Night" icon="moon">
      <DetailColumns
        main={
          <View className="gap-3">
            <View className="gap-0.5">
              <Text variant="footnote" tone="variant">
                Asleep
              </Text>
              <Figure value={hoursMinutes(night.asleepMinutes)} size="l" />
            </View>
            {night.hasStages ? (
              <StageTimeline segments={timelineOf(night)} label="Sleep stages" />
            ) : null}
          </View>
        }
        side={<StatList stats={nightStats(night, goals.sleep_minutes)} />}
      />
    </Card>
  );
}
