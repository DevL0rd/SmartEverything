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
import { clock, shortDate, startOfDayKey, weekdayShort } from '../../../format/time';
import { LIST_DOT } from '../item/composer-tokens';
import { calendarOf, hitTimeOf, matchedTextOf, type HitFormat } from './search-model';

export const HIT_FORMAT: HitFormat = {
  day: (moment) => `${weekdayShort(moment)} ${shortDate(moment)}`,
  date: (day) => {
    const moment = startOfDayKey(day);
    return `${weekdayShort(moment)} ${shortDate(moment)}`;
  },
  time: (moment) => clock(moment),
};

function HitLeading({
  hit,
  calendar,
}: {
  readonly hit: PlannerSearchHit;
  readonly calendar: PlannerCollectionRow | null;
}): ReactNode {
  const { at } = hitTimeOf(hit.occurrence, HIT_FORMAT);
  const dot = calendar === null ? 'bg-outline' : LIST_DOT[calendar.colour];
  const past = hit.reading === 'last';
  return (
    <View
      className={cn(
        'w-11 items-center rounded-sm py-1',
        past ? 'bg-surface-3' : 'bg-primary-container',
      )}
    >
      {at === null ? (
        <Icon name={hit.occurrence.kind === 'task' ? 'circleCheck' : 'calendar'} size={20} />
      ) : (
        <>
          <Text variant="caption" tone={past ? 'variant' : 'onPrimaryContainer'}>
            {weekdayShort(at)}
          </Text>
          <Text
            variant="body-strong"
            tone={past ? 'variant' : 'onPrimaryContainer'}
            className="tabular"
          >
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
  return useMemo(() => {
    const tokens = tokensOf(query);
    return hits.map((hit) => {
      const { occurrence } = hit;
      const calendar = calendarOf(collections, occurrence.collection_id);
      const time = hitTimeOf(occurrence, HIT_FORMAT).text;
      const subtitle = joinParts([time, calendar?.name]);
      const caption = matchedTextOf(hit.matched) ?? occurrence.location;
      const link = href.planner.item(occurrence.item_id, occurrence.occurrence_key);
      const props: ListRowProps = {
        title: occurrence.title,
        titleHighlight: rangeIn(occurrence.title, tokens),
        leading: <HitLeading hit={hit} calendar={calendar} />,
        label: joinParts([`Open ${occurrence.title}`, subtitle]),
        ...(subtitle === '' ? {} : { subtitle }),
        ...(caption === null ? {} : { caption }),
      };
      return { key: `${occurrence.item_id}:${occurrence.occurrence_key}`, props, link };
    });
  }, [hits, collections, query]);
}
