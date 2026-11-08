import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { chunk } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { List, SectionAction } from '../../../components/section';
import { Text } from '../../../components/text';
import { useDeleteWithUndo } from '../data/delete-recordings';
import { thumbOf, useEventFeed, type EventFeed } from '../data/use-event-feed';
import type { CameraEntry } from '../logic/cameras';
import { eventGridLayout, type EventGridSize } from '../logic/event-grid-layout';
import { NO_FILTER } from '../logic/timeline';
import { EventCard } from './event-card';
import { EventRow } from './event-row';

export interface RecentEventsProps {
  readonly cameras: readonly CameraEntry[];
  readonly limit: number;
  readonly title: string;
}

const UNMEASURED: EventGridSize = { width: 0, height: 0 };

export type NameOf = (deviceId: string) => string | null;

export function cameraNameOf(cameras: readonly CameraEntry[]): NameOf {
  const single = cameras.length === 1;
  return (deviceId) =>
    single ? null : (cameras.find((entry) => entry.device.id === deviceId)?.name ?? null);
}

function NothingYet(): ReactNode {
  return (
    <Text variant="callout" tone="variant" className="px-4 py-4">
      Nothing happened yet.
    </Text>
  );
}

function CardRow({
  entries,
  columns,
  feed,
  nameOf,
  onLayout,
  remove,
}: {
  readonly entries: EventFeed['entries'];
  readonly columns: number;
  readonly feed: EventFeed;
  readonly nameOf: NameOf;
  readonly onLayout: ((event: LayoutChangeEvent) => void) | undefined;
  readonly remove: ReturnType<typeof useDeleteWithUndo>['remove'];
}): ReactNode {
  return (
    <View className="flex-row gap-3" onLayout={onLayout}>
      {entries.map((entry) => (
        <EventCard
          key={entry.id}
          entry={entry}
          cameraName={nameOf(entry.deviceId)}
          thumb={thumbOf(feed, entry)}
          timeZone={feed.timeZone}
          onDelete={() => {
            remove(entry.id, entry.removal, entry.count > 1 ? 'Events' : 'Event');
          }}
        />
      ))}
      {Array.from({ length: columns - entries.length }, (_, gap) => (
        <View key={`gap-${String(gap)}`} className="flex-1" />
      ))}
    </View>
  );
}

export function RecentEventsGrid({
  cameras,
}: {
  readonly cameras: readonly CameraEntry[];
}): ReactNode {
  const [frame, setFrame] = useState(UNMEASURED);
  const [firstRow, setFirstRow] = useState(UNMEASURED);
  const deleting = useDeleteWithUndo();
  const { columns, rows } = eventGridLayout(frame, firstRow);
  const feed = useEventFeed(
    cameras.map((entry) => entry.device.id),
    NO_FILTER,
    columns * rows + deleting.hidden.size,
  );
  const nameOf = cameraNameOf(cameras);
  const shown = feed.entries.filter((entry) => !deleting.hidden.has(entry.id));
  if (shown.length === 0) return <NothingYet />;
  const measureFirstRow = ({ nativeEvent }: LayoutChangeEvent): void => {
    setFirstRow(nativeEvent.layout);
  };
  return (
    <View
      className="flex-1 gap-3"
      onLayout={(event) => {
        setFrame(event.nativeEvent.layout);
      }}
    >
      {frame.width === 0
        ? null
        : chunk(shown.slice(0, columns * rows), columns).map((row, index) => (
            <CardRow
              key={String(index)}
              entries={row}
              columns={columns}
              feed={feed}
              nameOf={nameOf}
              onLayout={index === 0 ? measureFirstRow : undefined}
              remove={deleting.remove}
            />
          ))}
    </View>
  );
}

function RecentEventsList({ cameras, limit }: Omit<RecentEventsProps, 'title'>): ReactNode {
  const feed = useEventFeed(
    cameras.map((entry) => entry.device.id),
    NO_FILTER,
    limit,
  );
  const nameOf = cameraNameOf(cameras);
  if (feed.entries.length === 0) return <NothingYet />;
  return feed.entries.map((entry) => (
    <EventRow
      key={entry.id}
      entry={entry}
      cameraName={nameOf(entry.deviceId)}
      thumb={thumbOf(feed, entry)}
      timeZone={feed.timeZone}
      onDelete={null}
    />
  ));
}

export function RecentEvents({ title, ...body }: RecentEventsProps): ReactNode {
  return (
    <List title={title} action={<SectionAction label="All events" href={href.cameraEvents()} />}>
      <RecentEventsList {...body} />
    </List>
  );
}
