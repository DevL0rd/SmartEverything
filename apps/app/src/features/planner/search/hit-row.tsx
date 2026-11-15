import type { PlannerCollectionRow, PlannerSearchHit } from '@smarteverything/domain';
import { tokensOf } from '@smarteverything/domain';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { rangeIn } from '../../../search/match';
import { Text } from '../../../components/text';
import type { ListRowProps } from '../../../components/list-row';
import { Icon } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { joinParts } from '../../../format/text';
import { clock, dayKeyOf, shortDate, startOfDayKey, weekdayShort } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { LIST_DOT } from '../item/composer-tokens';
import { calendarOf, hitTimeOf, matchedTextOf, type HitFormat, type HitTime } from './search-model';

export const HIT_FORMAT: HitFormat = {
  day: (moment) => `${weekdayShort(moment)} ${shortDate(moment)}`,
  date: (day) => {
    const moment = startOfDayKey(day);
    return `${weekdayShort(moment)} ${shortDate(moment)}`;
  },
  time: (moment) => clock(moment),
};

type TileTone = 'past' | 'overdue' | 'ahead';

const TILE: Readonly<Record<TileTone, string>> = {
  past: 'bg-surface-3',
  overdue: 'bg-critical/14',
  ahead: 'bg-primary-container',
};

const TILE_TEXT = {
  past: 'variant',
  overdue: 'critical',
  ahead: 'onPrimaryContainer',
} as const;

function tileMomentOf(time: HitTime): number | null {
  if (time.at !== null) return time.at;
  return time.day === null ? null : startOfDayKey(time.day);
}

function tileToneOf(hit: PlannerSearchHit, time: HitTime): TileTone {
  if (hit.reading === 'last') return 'past';
  return time.overdue ? 'overdue' : 'ahead';
}

function HitLeading({
  hit,
  time,
  calendar,
}: {
  readonly hit: PlannerSearchHit;
  readonly time: HitTime;
  readonly calendar: PlannerCollectionRow | null;
}): ReactNode {
  const at = tileMomentOf(time);
  const dot = calendar === null ? 'bg-outline' : LIST_DOT[calendar.colour];
  const tone = tileToneOf(hit, time);
  return (
    <View className={cn('h-11 w-11 items-center justify-center rounded-sm', TILE[tone])}>
      {at === null ? (
        <Icon
          name={hit.occurrence.kind === 'task' ? 'circleCheck' : 'calendar'}
          size={20}
          tone={TILE_TEXT[tone]}
        />
      ) : (
        <>
          <Text variant="caption" tone={TILE_TEXT[tone]}>
            {weekdayShort(at)}
          </Text>
          <Text variant="body-strong" tone={TILE_TEXT[tone]} className="tabular">
            {String(new Date(at).getDate())}
          </Text>
        </>
      )}
      <View className={cn('absolute right-0.5 top-0.5 size-2 rounded-full', dot)} />
    </View>
  );
}

export interface HitRowModel {
  readonly key: string;
  readonly props: ListRowProps;
  readonly link: AppHref;
}

export function useHitRows(
  hits: readonly PlannerSearchHit[],
  collections: readonly PlannerCollectionRow[],
  query: string,
): readonly HitRowModel[] {
  const now = useMinute();
  return useMemo(() => {
    const tokens = tokensOf(query);
    const clockNow = { now, today: dayKeyOf(now) };
    return hits.map((hit) => {
      const { occurrence } = hit;
      const calendar = calendarOf(collections, occurrence.collection_id);
      const time = hitTimeOf(occurrence, HIT_FORMAT, clockNow);
      const subtitle = joinParts([time.text, calendar?.name]);
      const caption = matchedTextOf(hit.matched) ?? occurrence.location;
      const link = href.planner.item(occurrence.item_id, occurrence.occurrence_key);
      const props: ListRowProps = {
        title: occurrence.title,
        titleHighlight: rangeIn(occurrence.title, tokens),
        leading: <HitLeading hit={hit} time={time} calendar={calendar} />,
        label: joinParts([`Open ${occurrence.title}`, subtitle]),
        ...(subtitle === '' ? {} : { subtitle }),
        ...(caption === null ? {} : { caption }),
      };
      return { key: `${occurrence.item_id}:${occurrence.occurrence_key}`, props, link };
    });
  }, [hits, collections, query, now]);
}
