import { hoursMinutes } from '../../../format/time';
import { tempoText, type Workout } from './workouts';
import { count, kilocalories, kilometres, withUnit } from '../../../format/number';

export interface WorkoutFact {
  readonly key: 'duration' | 'distance' | 'energy' | 'heart' | 'tempo';
  readonly label: string;
  readonly text: string;
}

export function workoutFacts(workout: Workout): readonly WorkoutFact[] {
  const facts: WorkoutFact[] = [
    { key: 'duration', label: 'Duration', text: hoursMinutes(workout.minutes) },
  ];
  if (workout.meters !== null) {
    facts.push({
      key: 'distance',
      label: 'Distance',
      text: kilometres(workout.meters),
    });
  }
  if (workout.kilocalories !== null) {
    facts.push({
      key: 'energy',
      label: 'Energy',
      text: kilocalories(workout.kilocalories),
    });
  }
  if (workout.averageBpm !== null) {
    facts.push({
      key: 'heart',
      label: 'Avg heart rate',
      text: withUnit(count(workout.averageBpm), 'bpm'),
    });
  }
  if (workout.secondsPerKm !== null) {
    facts.push({
      key: 'tempo',
      label: 'Pace',
      text: tempoText(workout.code, workout.secondsPerKm),
    });
  }
  return facts;
}
