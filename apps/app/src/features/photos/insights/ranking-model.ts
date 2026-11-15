import { PHOTO_INSIGHT_RANGES, type PhotoInsightRange } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { shortDate, startOfDayKey } from '../../../format/time';

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

export function busiestRowOf(entry: { readonly day: string; readonly items: number }): {
  readonly title: string;
  readonly note: string;
} {
  return {
    title: shortDate(startOfDayKey(entry.day)),
    note: entry.items === 1 ? '1 photo' : `${count(entry.items)} photos`,
  };
}
