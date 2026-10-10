import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '../../../components/card';
import { Sparkline } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Figure } from '../../../components/figure';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { DetailColumns } from '../components/detail-columns';
import { RouteMap } from '../components/route-map';
import { StatList } from '../components/stat-list';
import { WorkoutIcon } from '../components/workout-row';
import { useToday } from '../data/day';
import { useWorkoutDetail } from '../data/workout';
import { hoursMinutes } from '../../../format/time';
import { appName } from '../model/sources';
import { clock, dayLabel, startOfDayKey } from '../../../format/time';
import { workoutFacts } from '../model/workout-facts';
import type { Workout } from '../model/workouts';

function Summary({
  workout,
  today,
}: {
  readonly workout: Workout;
  readonly today: string;
}): ReactNode {
  const facts = workoutFacts(workout).filter((fact) => fact.key !== 'duration');
  return (
    <Card>
      <DetailColumns
        main={
          <View className="flex-row items-center gap-4">
            <WorkoutIcon workout={workout} />
            <View className="gap-0.5">
              <Figure value={hoursMinutes(workout.minutes)} size="l" />
              <Text variant="callout" tone="variant">
                {`${dayLabel(workout.start, startOfDayKey(today))} · ${clock(workout.start)} – ${clock(workout.end)}`}
              </Text>
            </View>
          </View>
        }
        side={
          <StatList
            stats={[
              ...facts.map((fact) => ({ label: fact.label, value: fact.text })),
              { label: 'Recorded by', value: appName(workout.source) },
            ]}
          />
        }
      />
    </Card>
  );
}

function HeartCard({ workout }: { readonly workout: Workout }): ReactNode {
  if (workout.heart.length < 2 || workout.averageBpm === null || workout.maxBpm === null) {
    return null;
  }
  return (
    <Card title="Heart rate" icon="heartPulse">
      <DetailColumns
        main={
          <View className="gap-1">
            <Sparkline
              points={workout.heart.map((sample) => ({ t: sample.at, v: sample.bpm }))}
              colour="heart"
              height={160}
              area
            />
            <View className="flex-row justify-between">
              <Text variant="caption" tone="faint" className="tabular">
                {clock(workout.start)}
              </Text>
              <Text variant="caption" tone="faint" className="tabular">
                {clock(workout.end)}
              </Text>
            </View>
          </View>
        }
        side={
          <StatList
            stats={[
              { label: 'Average', value: `${String(Math.round(workout.averageBpm))} bpm` },
              { label: 'Highest', value: `${String(Math.round(workout.maxBpm))} bpm` },
            ]}
          />
        }
      />
    </Card>
  );
}

function RouteCard({ workout }: { readonly workout: Workout }): ReactNode {
  const route = workout.route;
  if (route.status === 'absent') {
    return null;
  }
  return (
    <Card title="Route" icon="route">
      {route.status === 'recorded' ? (
        <RouteMap points={route.points} />
      ) : (
        <Text variant="callout" tone="variant">
          Open this workout on your phone to share its route.
        </Text>
      )}
    </Card>
  );
}

function Body({ recordId }: { readonly recordId: string }): ReactNode {
  const detail = useWorkoutDetail(recordId);
  const today = useToday();
  switch (detail.status) {
    case 'loading':
      return <Skeleton shape="block" className="h-56" />;
    case 'failed':
      return <ErrorState error={detail.error} />;
    case 'missing':
      return (
        <EmptyState
          icon="dumbbell"
          title="Workout not found"
          body="It may have been deleted on your phone."
        />
      );
    case 'ready':
      return (
        <>
          <Summary workout={detail.workout} today={today} />
          <HeartCard workout={detail.workout} />
          <RouteCard workout={detail.workout} />
          {detail.workout.notes === null ? null : (
            <Card title="Notes" icon="fileText">
              <Text variant="body">{detail.workout.notes}</Text>
            </Card>
          )}
        </>
      );
  }
}

export function WorkoutScreen(): ReactNode {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const detail = useWorkoutDetail(workoutId);
  const title =
    detail.status === 'ready' ? (detail.workout.title ?? detail.workout.name) : 'Workout';
  return (
    <Screen header={<PageHeader title={title} />} maxWidth="detail">
      <Body recordId={workoutId} />
    </Screen>
  );
}
