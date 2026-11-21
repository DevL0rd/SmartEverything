import type {
  DeviceLogEntry,
  DeviceRow,
  EventKind,
  EventRow,
  PhoneTier,
} from '@smarteverything/domain';
import type { HostStore } from '../../store/host/host-store';

export type LogStore = Pick<
  HostStore,
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
  readonly claimedKinds: readonly EventKind[];
  readonly read: (store: LogStore, request: LogRequest) => readonly DeviceLogEntry[];
}
