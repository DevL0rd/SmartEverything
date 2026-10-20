import type { TreadmillView } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { kilometresText, minutesText } from './stats-model';

export type StatsView = Extract<TreadmillView, { readonly view: 'stats' }>;

export const RING_DOT: Readonly<Record<string, string>> = {
  primary: 'bg-primary',
  positive: 'bg-positive',
  info: 'bg-info',
  caution: 'bg-caution',
  'viz-magenta': 'bg-viz-magenta',
  'viz-violet': 'bg-viz-violet',
};

export interface TodayRing {
  readonly key: string;
  readonly name: string;
  readonly done: string;
  readonly goal: string;
  readonly progress: number;
  readonly colour: ColourRole;
}

interface RingInput {
  readonly key: string;
  readonly name: string;
  readonly done: number;
  readonly goal: number;
  readonly doneText: string;
  readonly goalText: string;
  readonly colour: ColourRole;
}

function ring(input: RingInput): TodayRing {
  return {
    key: input.key,
    name: input.name,
    done: input.doneText,
    goal: input.goalText,
    progress: input.goal > 0 ? input.done / input.goal : 0,
    colour: input.colour,
  };
}

function optionalRings({ goals, today }: StatsView): TodayRing[] {
  const steps =
    goals.dailySteps === null
      ? []
      : [
          ring({
            key: 'steps',
            name: 'Steps today',
            done: today.steps,
            goal: goals.dailySteps,
            doneText: count(today.steps),
            goalText: count(goals.dailySteps),
            colour: 'caution',
          }),
        ];
  const energy =
    goals.dailyKcal === null
      ? []
      : [
          ring({
            key: 'kcal',
            name: 'Energy today',
            done: today.kcal,
            goal: goals.dailyKcal,
            doneText: `${count(Math.round(today.kcal))} kcal`,
            goalText: `${count(goals.dailyKcal)} kcal`,
            colour: 'viz-magenta',
          }),
        ];
  return [...steps, ...energy];
}

export function todayRings(view: StatsView): readonly TodayRing[] {
  const { goals, today, week } = view;
  const rings = [
    ring({
      key: 'minutes',
      name: 'Minutes today',
      done: today.activeSeconds / 60,
      goal: goals.dailyMinutes,
      doneText: minutesText(today.activeSeconds),
      goalText: `${String(goals.dailyMinutes)} min`,
      colour: 'primary',
    }),
    ring({
      key: 'distance',
      name: 'Distance this week',
      done: week.distanceM / 1000,
      goal: goals.weeklyKm,
      doneText: kilometresText(week.distanceM),
      goalText: kilometresText(goals.weeklyKm * 1000),
      colour: 'positive',
    }),
    ring({
      key: 'sessions',
      name: 'Sessions this week',
      done: week.sessions,
      goal: goals.weeklySessions,
      doneText: String(week.sessions),
      goalText: String(goals.weeklySessions),
      colour: 'info',
    }),
  ];
  return [...rings, ...optionalRings(view)];
}

export function ringSentence(item: TodayRing): string {
  return `${item.name}, ${item.done} of ${item.goal}`;
}

export function streakLine(streak: { readonly current: number; readonly longest: number }): string {
  if (streak.current === 0) {
    return streak.longest === 0 ? 'No streak yet' : `Best streak ${String(streak.longest)} days`;
  }
  const days = streak.current === 1 ? '1 day' : `${String(streak.current)} days`;
  return `${days} in a row · best ${String(streak.longest)}`;
}
