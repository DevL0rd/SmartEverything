import type { DeviceLogEntry, DeviceRow, EventRow, PhoneTier } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export type LogStore = Pick<
  Store,
  | 'state'
  | 'events'
  | 'commands'
  | 'automations'
  | 'automationRuns'
  | 'clients'
  | 'profiles'
  | 'devices'
>;

export interface LogRequest {
  readonly device: DeviceRow;
  readonly to: string | undefined;
  readonly limit: number;
  readonly tier: PhoneTier | null;
}

export interface DeviceLogSource {
  readonly claims: (device: DeviceRow, event: EventRow) => boolean;
  readonly read: (store: LogStore, request: LogRequest) => readonly DeviceLogEntry[];
}
