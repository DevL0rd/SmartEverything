import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { Screen } from '../../../components/screen';
import { VirtualList, type VirtualSection } from '../../../components/virtual-list';
import { dayLabel } from '../../../format/time';
import { daysOf } from '../../activity';
import { useMinute } from '../../../store/clock';
import { EventRow } from '../components/event-row';
import { cameraNameOf } from '../components/recent-events';
import { FilterButton } from '../components/filter-sheet';
import { useDeleteWithUndo } from '../data/delete-recordings';
import { useCameraEntries } from '../data/use-cameras';
import { thumbOf, useEventFeed, type EventFeed } from '../data/use-event-feed';
import type { CameraEntry } from '../logic/cameras';
import type { EventEntry } from '../logic/event-entries';
import { NO_FILTER, type TimelineFilter } from '../logic/timeline';

const log = new Logger('app.cameras');

interface Row {
  readonly entry: EventEntry;
  readonly child: boolean;
}

function rowsOf(entries: readonly EventEntry[], open: ReadonlySet<string>): Row[] {
  return entries.flatMap((entry) => [
    { entry, child: false },
    ...(open.has(entry.id) ? entry.children.map((child) => ({ entry: child, child: true })) : []),
  ]);
}

function sectionsOf(
  feed: EventFeed,
  open: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
  now: number,
): VirtualSection<Row>[] {
  const shown = feed.entries.filter((entry) => !hidden.has(entry.id));
  return daysOf(shown, (entry) => entry.at, feed.timeZone).map((group) => ({
    key: group.key,
    title: dayLabel(group.items[0]?.at ?? group.key, now, feed.timeZone),
    data: rowsOf(group.items, open).filter((row) => !hidden.has(row.entry.id)),
  }));
}

interface ToolbarProps {
  readonly filter: TimelineFilter;
  readonly setFilter: (filter: TimelineFilter) => void;
  readonly cameras: readonly CameraEntry[];
}

function Toolbar({ filter, setFilter, cameras }: ToolbarProps): ReactNode {
  return (
    <View className="flex-row px-gutter pb-2">
      <FilterButton filter={filter} onChange={setFilter} cameras={cameras} />
    </View>
  );
}

interface FeedRowProps {
  readonly row: Row;
  readonly feed: EventFeed;
  readonly expanded: boolean;
  readonly cameraName: string | null;
  readonly onToggle: () => void;
  readonly onRemove: (entry: EventEntry) => void;
}

function FeedRow({ row, feed, expanded, cameraName, onToggle, onRemove }: FeedRowProps): ReactNode {
  const { entry } = row;
  return (
    <View className={row.child ? 'pl-6' : ''}>
      <EventRow
        entry={entry}
        cameraName={cameraName}
        thumb={thumbOf(feed, entry)}
        timeZone={feed.timeZone}
        expanded={expanded}
        onToggle={onToggle}
        onDelete={(): void => {
          onRemove(entry);
        }}
      />
    </View>
  );
}

function toggled(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return current.has(id)
    ? new Set([...current].filter((key) => key !== id))
    : new Set([...current, id]);
}

function useEventsLog(shown: {
  readonly cameras: number;
  readonly feed: EventFeed;
  readonly filter: TimelineFilter;
  readonly open: number;
}): void {
  const { cameras, feed, filter, open } = shown;
  const entries = feed.entries.length;
  const thumbs = Object.keys(feed.thumbs).length;
  useLifecycleLog(log, 'events_screen');
  useEffect(() => {
    log.debug('events.feed_changed', { cameras, entries, thumbs });
  }, [cameras, entries, thumbs]);
  useEffect(() => {
    log.debug('events.filter_changed', () => ({
      cameras: filter.deviceIds?.length ?? null,
      kinds: filter.kinds?.join(',') ?? null,
      sounds: filter.soundDetections?.length ?? null,
    }));
  }, [filter]);
  useEffect(() => {
    log.debug('events.expanded_changed', { open });
  }, [open]);
}

export function EventsScreen(): ReactNode {
  const cameras = useCameraEntries();
  const [filter, setFilter] = useState<TimelineFilter>(NO_FILTER);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const feed = useEventFeed(
    cameras.map((entry) => entry.device.id),
    filter,
  );
  const deleting = useDeleteWithUndo();
  const now = useMinute();
  const nameOf = cameraNameOf(cameras);
  useEventsLog({ cameras: cameras.length, feed, filter, open: open.size });
  return (
    <Screen header={<PageHeader title="Events" />} scroll={false}>
      <View className="w-full max-w-reading flex-1 self-center">
        <VirtualList
          header={<Toolbar filter={filter} setFilter={setFilter} cameras={cameras} />}
          sections={sectionsOf(feed, open, deleting.hidden, now)}
          keyOf={(row) => row.entry.id}
          empty={
            <EmptyState
              icon="film"
              title="No events"
              body="Motion, calls and other camera events show up here."
            />
          }
          renderItem={(row) => (
            <FeedRow
              row={row}
              feed={feed}
              expanded={open.has(row.entry.id)}
              cameraName={nameOf(row.entry.deviceId)}
              onToggle={() => {
                setOpen((current) => toggled(current, row.entry.id));
              }}
              onRemove={(entry) => {
                deleting.remove(entry.id, entry.removal, entry.count > 1 ? 'Events' : 'Event');
              }}
            />
          )}
        />
      </View>
    </Screen>
  );
}
