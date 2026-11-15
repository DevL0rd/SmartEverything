import { PHOTO_INSIGHT_RANGES, type PhotoInsightRange } from '@smarteverything/domain';
import { zonedDateFormat } from '../../../format/locale';
import { count } from '../../../format/number';
import { shortDate, startOfDayKey } from '../../../format/time';

const DAY_WITH_YEAR = zonedDateFormat({ day: 'numeric', month: 'short', year: 'numeric' });

export const RANKING_IDS = ['largest-videos', 'busiest-days'] as const;

export type RankingId = (typeof RANKING_IDS)[number];

export const RANKING_TITLES: Readonly<Record<RankingId, string>> = {
  'largest-videos': 'Largest videos',
  'busiest-days': 'Busiest days',
};

export function rankingOf(raw: unknown): RankingId | null {
  return RANKING_IDS.find((id) => id === raw) ?? null;
}

export function rangeParamOf(raw: unknown): PhotoInsightRange {
  return PHOTO_INSIGHT_RANGES.find((range) => range === raw) ?? 'all_time';
}

export function busiestRowOf(
  entry: { readonly day: string; readonly items: number },
  range: PhotoInsightRange,
): {
  readonly title: string;
  readonly note: string;
} {
  const start = startOfDayKey(entry.day);
  return {
    title: range === 'this_year' ? shortDate(start) : DAY_WITH_YEAR(null).format(new Date(start)),
    note: entry.items === 1 ? '1 photo' : `${count(entry.items)} photos`,
  };
}
