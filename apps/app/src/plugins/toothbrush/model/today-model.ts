import { SCORE_WEIGHTS, type BrushStateView, type BrushingStats } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import { clockText } from './brush-model';

type Today = NonNullable<BrushStateView['today']>;

export interface RingSpec {
  readonly progress: number;
  readonly colour: ColourRole;
  readonly dot: string;
  readonly label: string;
}

export function todayRings(today: Today): readonly RingSpec[] {
  return [
    {
      progress: today.goalSessions === 0 ? 0 : today.counted / today.goalSessions,
      colour: 'primary',
      dot: 'bg-primary',
      label: `Brushes ${String(today.counted)} of ${String(today.goalSessions)}`,
    },
    {
      progress: today.goalSeconds === 0 ? 0 : today.seconds / today.goalSeconds,
      colour: 'viz-1',
      dot: 'bg-viz-1',
      label: `Time ${clockText(today.seconds)} of ${clockText(today.goalSeconds)}`,
    },
  ];
}

export function todayLine(today: Today): string {
  if (today.counted >= today.goalSessions) {
    return 'Goal reached today';
  }
  const left = today.goalSessions - today.counted;
  return `${String(left)} more ${left === 1 ? 'brush' : 'brushes'} to reach today’s goal`;
}

export function streakLine(current: number, longest: number): string {
  if (current === 0) {
    return longest === 0
      ? 'No streak yet'
      : `Streak ended. Best was ${String(longest)} ${longest === 1 ? 'day' : 'days'}`;
  }
  return `${String(current)} ${current === 1 ? 'day' : 'days'} in a row${current >= longest ? ', your best' : `, best ${String(longest)}`}`;
}

export function streakShort(current: number): string {
  if (current === 0) {
    return 'No streak yet';
  }
  return `${String(current)} ${current === 1 ? 'day' : 'days'} in a row`;
}

export interface ScoreRow {
  readonly label: string;
  readonly weight: number;
  readonly rate: number | null;
}

export function scoreRows(consistency: BrushingStats['consistency']): readonly ScoreRow[] {
  return [
    { label: 'Goal days', weight: SCORE_WEIGHTS.goal, rate: consistency.goalRate },
    { label: 'Whole routines', weight: SCORE_WEIGHTS.completion, rate: consistency.completionRate },
    { label: 'Gentle pressure', weight: SCORE_WEIGHTS.pressure, rate: consistency.pressureRate },
  ];
}

export function scoreWord(score: number | null): string {
  if (score === null) {
    return 'No score yet';
  }
  if (score >= 85) {
    return 'Excellent';
  }
  return score >= 65 ? 'Good' : 'Room to improve';
}
