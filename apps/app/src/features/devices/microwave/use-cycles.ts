import type { DeviceLogEntry } from '@smarteverything/domain';
import { readDeviceLog } from '../../../queries/device-log';
import { deviceLogKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { CYCLE_WINDOW, cyclesOf } from './cycles';

export function useCycles(deviceId: string, enabled: boolean): readonly DeviceLogEntry[] {
  return cyclesOf(
    useScreenQuery({
      queryKey: deviceLogKey(deviceId, CYCLE_WINDOW),
      queryFn: () => readDeviceLog(deviceId, CYCLE_WINDOW),
      enabled,
    }).data ?? [],
  );
}
