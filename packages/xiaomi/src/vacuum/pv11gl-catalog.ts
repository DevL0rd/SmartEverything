import catalogFile from './pv11gl-catalog.json' with { type: 'json' };
import faultFile from './pv11gl-faults.json' with { type: 'json' };
import {
  VACUUM_CATALOG,
  VACUUM_FAULT_TABLE,
  type VacuumAction,
  type VacuumCatalog,
  type VacuumEvent,
  type VacuumFault,
  type VacuumProperty,
} from './catalog-schema';

export const VACUUM_SERVICE_ID = {
  deviceInformation: 1,
  vacuum: 2,
  battery: 3,
  alarm: 4,
  physicalControlsLocked: 5,
  identify: 6,
  mop: 9,
  vacuumMap: 10,
  noDisturb: 11,
  mainBrush: 12,
  sideBrush: 13,
  filter: 14,
  voiceManagement: 15,
  imu: 16,
  aiSmallPictures: 17,
  detergentManagement: 18,
  dustBag: 19,
  custom: 20,
  streamManagement: 21,
  selfCheck: 22,
  standardMap: 23,
  roller: 24,
} as const;

export type VacuumServiceKey = keyof typeof VACUUM_SERVICE_ID;

export interface VacuumStatusEntry {
  readonly value: number;
  readonly spec: string;
  readonly label: string;
}

export class VacuumCatalogError extends Error {
  override readonly name = 'VacuumCatalogError';

  constructor(
    readonly kind: string,
    readonly service: string,
    readonly entryName: string,
  ) {
    super(`The pv11gl catalog has no ${kind} named ${entryName} in service ${service}.`);
  }
}

interface Catalogs {
  readonly catalog: VacuumCatalog;
  readonly faults: readonly VacuumFault[];
  readonly faultsByCode: ReadonlyMap<number, VacuumFault>;
  readonly statuses: readonly VacuumStatusEntry[];
}

let parsed: Catalogs | null = null;

function load(): Catalogs {
  if (parsed !== null) {
    return parsed;
  }
  const catalog = VACUUM_CATALOG.parse(catalogFile);
  const faults = VACUUM_FAULT_TABLE.parse(faultFile);
  const status = catalog.properties.find(
    (entry) => entry.siid === VACUUM_SERVICE_ID.vacuum && entry.name === 'status',
  );
  if (status === undefined) {
    throw new VacuumCatalogError('property', 'vacuum', 'status');
  }
  parsed = {
    catalog,
    faults,
    faultsByCode: new Map(faults.map((fault) => [fault.code, fault])),
    statuses: status.values.map((option) => ({
      value: option.value,
      spec: option.spec,
      label: option.appLabel,
    })),
  };
  return parsed;
}

export function pv11glCatalog(): VacuumCatalog {
  return load().catalog;
}

export function findProperty(siid: number, piid: number): VacuumProperty | null {
  return (
    pv11glCatalog().properties.find((entry) => entry.siid === siid && entry.piid === piid) ?? null
  );
}

export function isAbsentOnDevice(siid: number, piid: number): boolean {
  return findProperty(siid, piid)?.absentOnDevice === true;
}

export function findAction(siid: number, aiid: number): VacuumAction | null {
  return (
    pv11glCatalog().actions.find((entry) => entry.siid === siid && entry.aiid === aiid) ?? null
  );
}

export function findEvent(siid: number, eiid: number): VacuumEvent | null {
  return pv11glCatalog().events.find((entry) => entry.siid === siid && entry.eiid === eiid) ?? null;
}

function named<T extends { readonly siid: number; readonly name: string }>(
  kind: string,
  entries: readonly T[],
  service: VacuumServiceKey,
  name: string,
): T {
  const found = entries.find(
    (entry) => entry.siid === VACUUM_SERVICE_ID[service] && entry.name === name,
  );
  if (found === undefined) {
    throw new VacuumCatalogError(kind, service, name);
  }
  return found;
}

export function vacuumProperty(service: VacuumServiceKey, name: string): VacuumProperty {
  return named('property', pv11glCatalog().properties, service, name);
}

export function vacuumAction(service: VacuumServiceKey, name: string): VacuumAction {
  return named('action', pv11glCatalog().actions, service, name);
}

export function vacuumEvent(service: VacuumServiceKey, name: string): VacuumEvent {
  return named('event', pv11glCatalog().events, service, name);
}

export function vacuumStatusTable(): readonly VacuumStatusEntry[] {
  return load().statuses;
}

export function vacuumStatus(value: number): VacuumStatusEntry | null {
  return load().statuses.find((entry) => entry.value === value) ?? null;
}

export function vacuumFaultTable(): readonly VacuumFault[] {
  return load().faults;
}

export function vacuumFault(code: number): VacuumFault | null {
  return load().faultsByCode.get(code) ?? null;
}
