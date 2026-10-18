import type { DeviceLogEntry } from '@smarteverything/domain';
import { DEVICE_LOG_SOURCES } from './sources';
import type { LogRequest, LogStore } from './types';

export function readDeviceLog(store: LogStore, request: LogRequest): DeviceLogEntry[] {
  return DEVICE_LOG_SOURCES.flatMap((source) => source.read(store, request))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, request.limit);
}
