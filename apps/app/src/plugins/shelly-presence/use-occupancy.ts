import type { TimelineSegment } from '../../components/charts';
import { readDeviceRows } from '../../queries/history';
import { deviceHistoryKey } from '../../queries/keys';
import { useScreenQuery } from '../../queries/use-screen-query';
import type { Device } from '../../store/state';
import { OCCUPANCY_HOURS, occupancyWindow, occupiedSegments } from './presence-face-model';

export interface Occupancy {
  readonly segments: readonly TimelineSegment<'occupied'>[];
  readonly from: number;
  readonly to: number;
}

const NONE: Occupancy = { segments: [], from: 0, to: 0 };

async function readOccupancy(deviceId: string): Promise<Occupancy> {
  const rows = await readDeviceRows(deviceId, 'occupancy', OCCUPANCY_HOURS);
  const to = Date.now();
  return { segments: occupiedSegments(rows, to), ...occupancyWindow(to) };
}

export function useOccupancy(device: Device, enabled: boolean): Occupancy {
  const query = useScreenQuery({
    queryKey: deviceHistoryKey(device.id, 'occupancy-timeline', OCCUPANCY_HOURS),
    queryFn: () => readOccupancy(device.id),
    enabled,
  });
  return query.data ?? NONE;
}
