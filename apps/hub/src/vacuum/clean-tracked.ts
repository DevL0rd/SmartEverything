import {
  isVacuumValueRole,
  presentDevice,
  type CapabilityKey,
  type CapabilityRole,
  type DeviceEvent,
  type DeviceRow,
  type JsonValue,
  type Provider,
  type VacuumClean,
  type VacuumRoleSource,
  type VacuumTrailRun,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export interface CleanMap {
  readonly taskId: number | null;
  readonly index: number | null;
  readonly rooms: ReadonlyMap<number, string>;
  readonly trail: readonly VacuumTrailRun[];
}

export interface CleanStore {
  readonly save: (deviceId: string, clean: VacuumClean) => void;
  readonly get: (deviceId: string, id: string) => VacuumClean | undefined;
  readonly open: (deviceId: string) => VacuumClean | undefined;
  readonly rename: (deviceId: string, from: string, to: string) => void;
}

export interface CleanTrackerPorts {
  readonly device: (deviceId: string) => DeviceRow | undefined;
  readonly value: (deviceId: string, key: CapabilityKey) => JsonValue | undefined;
  readonly record: (provider: Provider, event: DeviceEvent) => void;
  readonly cleans: CleanStore;
  readonly map: (deviceId: string) => CleanMap;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface Tracked {
  readonly device: DeviceRow;
  readonly sources: readonly VacuumRoleSource[];
  readonly roles: ReadonlyMap<string, CapabilityRole>;
  readonly keys: ReadonlyMap<CapabilityRole, CapabilityKey>;
}

export const FACT_ROLES: ReadonlySet<CapabilityRole> = new Set([
  'vacuum_job',
  'vacuum_scope',
  'vacuum_mode',
  'vacuum_area',
  'vacuum_seconds',
]);
export const RESULT_ROLES: ReadonlySet<CapabilityRole> = new Set(['vacuum_area', 'vacuum_seconds']);

export function trackedOf(device: DeviceRow): Tracked | null {
  const presentation = presentDevice(device);
  if (presentation.family !== 'vacuum') return null;
  const sources: VacuumRoleSource[] = presentation.capabilities.map(({ key, role }) => ({
    key,
    role,
  }));
  const valued = sources.flatMap(({ key, role }) =>
    isVacuumValueRole(role) ? [[key, role] as const] : [],
  );
  return {
    device,
    sources,
    roles: new Map(valued),
    keys: new Map(valued.map(([key, role]) => [role, key] as const)),
  };
}
