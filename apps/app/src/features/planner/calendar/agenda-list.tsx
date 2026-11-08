import type { PlannerColourKey, PlannerRange } from '@smarteverything/domain';
import { memo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { Interactive } from '../../../components/interactive';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { usePlannerCollections, usePlannerRange } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { QueryBody } from '../frame/query-body';
import { frameLayoutOf } from '../frame/sections';
import { LIST_DOT } from '../item/composer-tokens';
import {
  agendaDaysOf,
  agendaRowsOf,
  agendaWindowOf,
  dayMapOf,
  type AgendaEntry,
  type AgendaHead,
  type AgendaRow,
  type RowEdge,
} from './month-model';

const FRAME: Readonly<Record<RowEdge, string>> = {
  only: 'rounded-lg',
  first: 'rounded-t-lg border-b-0',
  middle: 'border-y-0',
  last: 'rounded-b-lg border-t-0',
};

function stripeOf(colour: PlannerColourKey | null): string {
  return colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
}

function GoogleMark(): ReactNode {
  return (
    <View className="h-4.5 min-w-4.5 items-center justify-center rounded-full bg-surface-3 px-1">
      <Text variant="caption" tone="variant">
        G
      </Text>
    </View>
  );
}

function CompactLine({ entry }: { readonly entry: AgendaEntry }): ReactNode {
  return (
    <>
      <Text variant="caption" tone="variant" numberOfLines={2} className="w-11 font-mono tabular">
        {entry.time}
      </Text>
      <View className={cn('h-7 w-0.75 rounded-full', stripeOf(entry.colour))} />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {entry.occurrence.title}
        </Text>
        {entry.detail === '' ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {entry.detail}
          </Text>
        )}
      </View>
    </>
  );
}

function WideLine({ entry }: { readonly entry: AgendaEntry }): ReactNode {
  return (
    <>
      <Text variant="caption" tone="variant" numberOfLines={1} className="w-24 font-mono tabular">
        {entry.range}
      </Text>
      <View className={cn('h-6 w-0.75 rounded-full', stripeOf(entry.colour))} />
      <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
        {entry.occurrence.title}
      </Text>
      {entry.calendar === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
          {entry.calendar}
        </Text>
      )}
    </>
  );
}

export interface AgendaItemProps {
  readonly entry: AgendaEntry;
  readonly edge: RowEdge;
  readonly wide: boolean;
}

function Item({ entry, edge, wide }: AgendaItemProps): ReactNode {
  return (
    <View className={cn('border-hairline border-outline-variant bg-surface-1', FRAME[edge])}>
      {edge === 'middle' || edge === 'last' ? (
        <View className="mx-3 h-hairline bg-outline-variant" />
      ) : null}
      <Interactive
        href={href.planner.item(entry.occurrence.item_id)}
        label={entry.spoken}
        className="min-h-12 flex-row items-center gap-3 px-3 py-2"
        layerClassName={FRAME[edge]}
        focusInset
      >
        {wide ? <WideLine entry={entry} /> : <CompactLine entry={entry} />}
        {entry.google ? <GoogleMark /> : null}
      </Interactive>
    </View>
  );
}

export const AgendaItem = memo(Item);

export function AgendaDayHead({ head }: { readonly head: AgendaHead }): ReactNode {
  return (
    <View className="flex-row items-baseline gap-2 pb-1 pt-4">
      <Text
        variant="label"
        tone={head.today ? 'primary' : 'default'}
        accessibilityRole="header"
        numberOfLines={1}
        className="shrink"
      >
        {head.label}
      </Text>
      <Text variant="caption" tone="variant" className="tabular">
        {head.counts}
      </Text>
    </View>
  );
}

function sameRow(left: AgendaRow, right: AgendaRow): boolean {
  if (left.kind === 'head' && right.kind === 'head') {
    return left.head.label === right.head.label && left.head.counts === right.head.counts;
  }
  if (left.kind === 'entry' && right.kind === 'entry') {
    return (
      left.edge === right.edge &&
      left.entry.occurrence === right.entry.occurrence &&
      left.entry.calendar === right.entry.calendar &&
      left.entry.colour === right.entry.colour
    );
  }
  return false;
}

function keyOf(row: AgendaRow): string {
  return row.key;
}

function typeOf(row: AgendaRow): string {
  return row.kind;
}

interface AgendaRowsProps {
  readonly range: PlannerRange;
  readonly day: string;
  readonly wide: boolean;
}

function AgendaSearch({
  query,
  onQuery,
}: {
  readonly query: string;
  readonly onQuery: (query: string) => void;
}): ReactElement {
  return (
    <View className="px-gutter pb-1">
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder="Search events and tasks"
        variant="field"
      />
    </View>
  );
}

function AgendaEmpty({ searching }: { readonly searching: boolean }): ReactElement {
  if (searching) return <EmptyState icon="search" title="No matches" body="Try another word." />;
  return (
    <EmptyState
      icon="calendar"
      title="Nothing planned"
      body="Events and tasks for the next month show here."
    />
  );
}

function useAgendaRows(range: PlannerRange, day: string, query: string): readonly AgendaRow[] {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const window = agendaDaysOf(day);
  return agendaRowsOf({
    days: dayMapOf(range.occurrences, timeZone, window),
    window,
    today: useMinuteOf(dayKeyOf),
    collections: usePlannerCollections(person),
    timeZone,
    query,
  });
}

function AgendaRows({ range, day, wide }: AgendaRowsProps): ReactNode {
  const [query, setQuery] = useState('');
  const rows = useAgendaRows(range, day, query);
  const renderItem = (row: AgendaRow): ReactElement =>
    row.kind === 'head' ? (
      <AgendaDayHead head={row.head} />
    ) : (
      <AgendaItem entry={row.entry} edge={row.edge} wide={wide} />
    );
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <VirtualList
        sections={rows.length === 0 ? [] : [{ key: 'agenda', title: null, data: rows }]}
        keyOf={keyOf}
        typeOf={typeOf}
        renderItem={renderItem}
        sameItem={sameRow}
        {...(wide ? { header: <AgendaSearch query={query} onQuery={setQuery} /> } : {})}
        empty={<AgendaEmpty searching={query.trim() !== ''} />}
        probe="planner-agenda"
      />
    </View>
  );
}

export interface AgendaListProps {
  readonly day: string;
  readonly calendars: readonly string[] | null;
}

export function AgendaList({ day, calendars }: AgendaListProps): ReactNode {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const wide = frameLayoutOf(useAreaWidth()) !== 'compact';
  const { from, to } = agendaWindowOf(day, timeZone);
  return (
    <QueryBody query={usePlannerRange(person, from, to, calendars)}>
      {(range) => <AgendaRows range={range} day={day} wide={wide} />}
    </QueryBody>
  );
}
