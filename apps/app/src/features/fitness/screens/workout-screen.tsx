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
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useSizeClass } from '../../../design/size-class';
import { DetailColumns } from '../components/detail-columns';
import { RouteMap } from '../components/route-map';
import { StatList } from '../components/stat-list';
import { WorkoutIcon } from '../components/workout-row';
import { useToday } from '../data/day';
import { useWorkoutDetail, type WorkoutDetail } from '../data/workout';
import { appName } from '../model/sources';
import { clock, dayLabel, hoursMinutes, startOfDayKey } from '../../../format/time';
import { count, withUnit } from '../../../format/number';
import { workoutFacts } from '../model/workout-facts';
import type { Workout } from '../model/workouts';

const MIN_WORKOUT_SPLIT_WIDTH = 1080;

function Summary({
  workout,
  today,
  showCustomTitle,
}: {
  readonly workout: Workout;
  readonly today: string;
  readonly showCustomTitle: boolean;
}): ReactNode {
  const facts = workoutFacts(workout).filter((fact) => fact.key !== 'duration');
  return (
    <Card {...(showCustomTitle && workout.title !== null ? { title: workout.title } : {})}>
      <DetailColumns
        main={
          <View className="flex-row items-center gap-4">
            <WorkoutIcon workout={workout} />
            <View className="min-w-0 flex-1 gap-0.5">
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
              { label: 'Average', value: withUnit(count(workout.averageBpm), 'bpm') },
              { label: 'Highest', value: withUnit(count(workout.maxBpm), 'bpm') },
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

function WorkoutContent({
  workout,
  showCustomTitle,
}: {
  readonly workout: Workout;
  readonly showCustomTitle: boolean;
}): ReactNode {
  const today = useToday();
  const { width, onLayout } = useMeasuredWidth();
  const hasDetails = workout.route.status !== 'absent' || workout.notes !== null;
  const split = hasDetails && width >= MIN_WORKOUT_SPLIT_WIDTH;
  return (
    <View onLayout={onLayout} className={cn('gap-section-gap', split && 'flex-row items-start')}>
      <View className={cn('min-w-0 gap-section-gap', split && 'flex-2')}>
        <Summary workout={workout} today={today} showCustomTitle={showCustomTitle} />
        <HeartCard workout={workout} />
      </View>
      {hasDetails ? (
        <View className={cn('min-w-0 gap-section-gap', split && 'flex-1')}>
          <RouteCard workout={workout} />
          {workout.notes === null ? null : (
            <Card title="Notes" icon="fileText">
              <Text variant="body">{workout.notes}</Text>
            </Card>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Body({
  detail,
  showCustomTitle,
}: {
  readonly detail: WorkoutDetail;
  readonly showCustomTitle: boolean;
}): ReactNode {
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
      return <WorkoutContent workout={detail.workout} showCustomTitle={showCustomTitle} />;
  }
}

export function WorkoutScreen(): ReactNode {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const detail = useWorkoutDetail(workoutId);
  const showCustomTitle = useSizeClass().header !== 'desktop';
  const title =
    detail.status === 'ready'
      ? ((showCustomTitle ? null : detail.workout.title) ?? detail.workout.name)
      : 'Workout';
  return (
    <Screen header={<PageHeader title={title} titleLines={2} />}>
      <Body detail={detail} showCustomTitle={showCustomTitle} />
    </Screen>
  );
}
