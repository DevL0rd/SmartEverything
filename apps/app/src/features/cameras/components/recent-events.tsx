import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { List, Section, SectionAction } from '../../../components/section';
import { Text } from '../../../components/text';
import { useDeleteWithUndo } from '../data/delete-recordings';
import { thumbOf, useEventFeed, type EventFeed } from '../data/use-event-feed';
import type { CameraEntry } from '../logic/cameras';
import { NO_FILTER } from '../logic/timeline';
import { EventCard } from './event-card';
import { EventRow } from './event-row';

type RecentLayout = 'list' | 'grid';

export interface RecentEventsProps {
  readonly cameras: readonly CameraEntry[];
  readonly limit: number;
  readonly title: string;
  readonly layout?: RecentLayout;
}

const CARD_MIN_WIDTH = 240;

export type NameOf = (deviceId: string) => string | null;

export function cameraNameOf(cameras: readonly CameraEntry[]): NameOf {
  const single = cameras.length === 1;
  return (deviceId) =>
    single ? null : (cameras.find((entry) => entry.device.id === deviceId)?.name ?? null);
}

function CardGrid({
  feed,
  nameOf,
}: {
  readonly feed: EventFeed;
  readonly nameOf: NameOf;
}): ReactNode {
  const [width, setWidth] = useState(0);
  const deleting = useDeleteWithUndo();
  const columns = Math.max(2, Math.floor(width / CARD_MIN_WIDTH));
  const shown = feed.entries.filter((entry) => !deleting.hidden.has(entry.id)).slice(0, columns);
  return (
    <View
      className="flex-row gap-3"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {width === 0
        ? null
        : shown.map((entry) => (
            <EventCard
              key={entry.id}
              entry={entry}
              cameraName={nameOf(entry.deviceId)}
              thumb={thumbOf(feed, entry)}
              timeZone={feed.timeZone}
              onDelete={() => {
                deleting.remove(entry.id, entry.removal, entry.count > 1 ? 'Events' : 'Event');
              }}
            />
          ))}
      {Array.from({ length: Math.max(0, columns - shown.length) }, (_, index) => (
        <View key={`gap-${String(index)}`} className="flex-1" />
      ))}
    </View>
  );
}

export function RecentEventsBody({
  cameras,
  limit,
  layout = 'list',
}: Omit<RecentEventsProps, 'title'>): ReactNode {
  const feed = useEventFeed(
    cameras.map((entry) => entry.device.id),
    NO_FILTER,
    limit,
  );
  const nameOf = cameraNameOf(cameras);
  if (feed.entries.length === 0) {
    return (
      <Text variant="callout" tone="variant" className="px-4 py-4">
        Nothing happened yet.
      </Text>
    );
  }
  if (layout === 'grid') {
    return <CardGrid feed={feed} nameOf={nameOf} />;
  }
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

export function RecentEvents({ title, layout = 'list', ...body }: RecentEventsProps): ReactNode {
  const more = <SectionAction label="All events" href={href.cameraEvents()} />;
  const content = <RecentEventsBody {...body} layout={layout} />;
  return layout === 'grid' ? (
    <Section title={title} action={more}>
      {content}
    </Section>
  ) : (
    <List title={title} action={more}>
      {content}
    </List>
  );
}
