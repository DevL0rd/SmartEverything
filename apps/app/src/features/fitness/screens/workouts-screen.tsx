import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '../../../components/card';
import { ErrorState } from '../../../components/error-state';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { FitnessFrame } from '../components/fitness-frame';
import { FitnessToolbar } from '../components/fitness-toolbar';
import { NoDataRow } from '../components/no-data-row';
import { StatList } from '../components/stat-list';
import { WorkoutRow } from '../components/workout-row';
import { DetailColumns } from '../components/detail-columns';
import { useFitnessParams } from '../data/day';
import { useWorkouts } from '../data/workout-list';
import { hoursMinutes } from '../../../format/time';
import { windowOf, type Range } from '../model/window';
import { personalRecords, tempoText, type PersonalRecord, type Workout } from '../model/workouts';
import { kilocalories, kilometres } from '../../../format/number';
import { useStartWorkout } from '../../watches';

const RANGES: readonly Range[] = ['week', 'month', 'year'];

function recordValue(record: PersonalRecord): string {
  switch (record.kind) {
    case 'meters':
      return kilometres(record.value);
    case 'minutes':
      return hoursMinutes(record.value);
    case 'pace':
      return tempoText(record.workout.code, record.value);
    case 'kilocalories':
      return kilocalories(record.value);
  }
}

function Records({ workouts }: { readonly workouts: readonly Workout[] }): ReactNode {
  const records = personalRecords(workouts);
  const activities = [...new Set(records.map((record) => record.activity))];
  return activities.map((activity) => (
    <Card key={activity} title={`${activity} bests`} icon="trophy">
      <StatList
        stats={records
          .filter((record) => record.activity === activity)
          .map((record) => ({ label: record.label, value: recordValue(record) }))}
      />
    </Card>
  ));
}

export function WorkoutsScreen(): ReactNode {
  const { day, today, range } = useFitnessParams('month');
  const window = windowOf(range === 'day' ? 'week' : range, day);
  const list = useWorkouts(window);
  const { start } = useLocalSearchParams<{ start?: string }>();
  const workout = useStartWorkout(start === '1');
  return (
    <FitnessFrame
      tab="workouts"
      width="detail"
      toolbar={<FitnessToolbar day={day} today={today} range={window.range} ranges={RANGES} />}
      primaryAction={workout.action}
    >
      {workout.sheet}
      {list.error === null ? null : <ErrorState error={list.error} />}
      {list.loaded ? null : <Skeleton shape="block" className="h-72" />}
      {list.loaded && list.workouts.length === 0 ? (
        <NoDataRow what="workouts in this period" lastDay={null} />
      ) : null}
      {list.workouts.length === 0 ? null : (
        <DetailColumns
          main={
            <List inset>
              {list.workouts.map((workout) => (
                <WorkoutRow key={workout.recordId} workout={workout} today={today} />
              ))}
            </List>
          }
          side={<Records workouts={list.workouts} />}
        />
      )}
    </FitnessFrame>
  );
}
