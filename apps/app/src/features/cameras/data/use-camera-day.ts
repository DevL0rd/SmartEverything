import type { CalendarDate, EventRow, RecordingRow } from '@smarteverything/domain';
import { readCameraDay, type CameraDay } from '../../../api/media';
import { cameraDayKey } from '../../../queries/camera-day';
import {
  dayBounds,
  timelineItems,
  type TimelineFilter,
  type TimelineItem,
} from '../logic/timeline';
import { useScreenQuery } from '../../../queries/use-screen-query';

export type CameraItem = TimelineItem<EventRow, RecordingRow>;

export type CameraDayRead =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: Error; readonly retry: () => void }
  | { readonly status: 'ready'; readonly items: readonly CameraItem[] };

function cameraDayQuery(
  deviceIds: readonly string[],
  day: CalendarDate,
  timeZone: string,
): { readonly queryKey: readonly string[]; readonly queryFn: () => Promise<CameraDay> } {
  const window = dayBounds(day, timeZone);
  return {
    queryKey: cameraDayKey(window.start, window.end, deviceIds),
    queryFn: () => readCameraDay(deviceIds, window),
  };
}

export function useCameraDay(
  deviceIds: readonly string[],
  day: CalendarDate,
  timeZone: string,
  filter: TimelineFilter,
): CameraDayRead {
  const read = useScreenQuery(cameraDayQuery(deviceIds, day, timeZone));
  if (read.error !== null) {
    return {
      status: 'failed',
      error: read.error,
      retry: (): void => {
        void read.refetch();
      },
    };
  }
  if (read.data === undefined) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    items: timelineItems(read.data.events, read.data.recordings, deviceIds, filter),
  };
}
