import { signed } from '../../../format/number';
import type { ColourRole } from '../../../design/tokens';
import type { GaugeBand } from '../../../components/charts';

export const SCORE_BANDS: readonly GaugeBand[] = [
  { upTo: 60, colour: 'warning' satisfies ColourRole },
  { upTo: 100, colour: 'positive' satisfies ColourRole },
];

export const BANNER_BODY = 'Tell us who stepped on so your trend stays right.';

export function deltaChips(week: number | null, month: number | null): readonly string[] {
  return [
    ...(week === null ? [] : [`${signed(week, 1)} kg this week`]),
    ...(month === null ? [] : [`${signed(month, 1)} kg this month`]),
  ];
}

export function scoreWord(score: number): string {
  return score >= 80 ? 'Great' : score >= 60 ? 'Good' : 'Needs attention';
}
