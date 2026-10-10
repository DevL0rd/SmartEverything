import { useSettings } from '../../../store/selectors';
import { eventEntries, thumbnailIds, type EventEntry } from '../logic/event-entries';
import { timelineItems, type TimelineFilter } from '../logic/timeline';
import { useCameraEvents, useCameraRecordings } from './use-cameras';
import { useRecordingLinks } from './use-media-links';

export interface EventFeed {
  readonly entries: readonly EventEntry[];
  readonly thumbs: Readonly<Record<string, string>>;
  readonly timeZone: string;
}

export function useEventFeed(
  deviceIds: readonly string[],
  filter: TimelineFilter,
  limit: number | null = null,
): EventFeed {
  const events = useCameraEvents(deviceIds);
  const recordings = useCameraRecordings(deviceIds);
  const timeZone = useSettings().time_zone;
  const all = eventEntries(timelineItems(events, recordings, deviceIds, filter));
  const entries = limit === null ? all : all.slice(0, limit);
  const links = useRecordingLinks(thumbnailIds(entries), 'thumb');
  const thumbs = Object.fromEntries(
    Object.entries(links.data ?? {}).map(([id, link]) => [id, link.url]),
  );
  return { entries, thumbs, timeZone };
}

export function thumbOf(feed: EventFeed, entry: EventEntry): string | null {
  return entry.snapshotId === null ? null : (feed.thumbs[entry.snapshotId] ?? null);
}
