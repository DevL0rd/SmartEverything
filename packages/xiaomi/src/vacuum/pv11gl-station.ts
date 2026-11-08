import type { VacuumAction, VacuumProperty } from './catalog-schema';
import { vacuumAction, vacuumProperty, type VacuumServiceKey } from './pv11gl-catalog';

export type ConsumableId =
  'main-brush' | 'side-brush' | 'filter' | 'mop' | 'detergent' | 'dust-bag' | 'roller';

export interface VacuumConsumable {
  readonly id: ConsumableId;
  readonly service: VacuumServiceKey;
  readonly level: VacuumProperty;
  readonly leftTime: VacuumProperty;
  readonly reset: VacuumAction;
}

interface ConsumableSource {
  readonly id: ConsumableId;
  readonly service: VacuumServiceKey;
  readonly level: string;
  readonly leftTime: string;
  readonly reset: string;
}

const CONSUMABLE_SOURCES: readonly ConsumableSource[] = [
  {
    id: 'main-brush',
    service: 'mainBrush',
    level: 'brush-life-level',
    leftTime: 'brush-left-time',
    reset: 'reset-brush-life',
  },
  {
    id: 'side-brush',
    service: 'sideBrush',
    level: 'brush-life-level',
    leftTime: 'brush-left-time',
    reset: 'reset-brush-life',
  },
  {
    id: 'filter',
    service: 'filter',
    level: 'filter-life-level',
    leftTime: 'filter-left-time',
    reset: 'reset-filter-life',
  },
  {
    id: 'mop',
    service: 'mop',
    level: 'mop-life-level',
    leftTime: 'mop-left-time',
    reset: 'reset-mop-life',
  },
  {
    id: 'detergent',
    service: 'detergentManagement',
    level: 'detergent-left-level',
    leftTime: 'detergent-left-time',
    reset: 'reset-detergent-management-level',
  },
  {
    id: 'dust-bag',
    service: 'dustBag',
    level: 'dust-bag-life-level',
    leftTime: 'dust-bag-left-time',
    reset: 'reset-dust-bag-life',
  },
  {
    id: 'roller',
    service: 'roller',
    level: 'roller-life-level',
    leftTime: 'roller-left-time',
    reset: 'reset-roller-life',
  },
];

export type StationFunctionId = 'dust-collection' | 'mop-wash' | 'roller-wash' | 'dry' | 'eject';

export interface VacuumStationFunction {
  readonly id: StationFunctionId;
  readonly start: VacuumAction;
  readonly stop: VacuumAction | null;
  readonly doneEvent: number | null;
  readonly mode: number | null;
}

interface StationSource {
  readonly id: StationFunctionId;
  readonly service: VacuumServiceKey;
  readonly start: string;
  readonly stop: string | null;
  readonly doneEvent: number | null;
  readonly mode: number | null;
}

const STATION_SOURCES: readonly StationSource[] = [
  {
    id: 'dust-collection',
    service: 'vacuum',
    start: 'start-dust-arrest',
    stop: null,
    doneEvent: 3,
    mode: 2,
  },
  {
    id: 'mop-wash',
    service: 'vacuum',
    start: 'start-mop-wash',
    stop: 'stop-mop-wash',
    doneEvent: 4,
    mode: 3,
  },
  {
    id: 'roller-wash',
    service: 'roller',
    start: 'start-wash-roller',
    stop: 'stop-wash-roller',
    doneEvent: 4,
    mode: 3,
  },
  { id: 'dry', service: 'vacuum', start: 'start-dry', stop: 'stop-dry', doneEvent: 5, mode: 1 },
  { id: 'eject', service: 'vacuum', start: 'start-eject', stop: null, doneEvent: null, mode: null },
];

export interface VacuumStationMode {
  readonly value: number;
  readonly name:
    'idle' | 'dry' | 'dust-collection' | 'mop-wash' | 'cut-hair' | 'air-dry' | 'rewash';
  readonly seenLive: boolean;
}

export const STATION_MODES: readonly VacuumStationMode[] = [
  { value: 0, name: 'idle', seenLive: true },
  { value: 1, name: 'dry', seenLive: true },
  { value: 2, name: 'dust-collection', seenLive: true },
  { value: 3, name: 'mop-wash', seenLive: true },
  { value: 4, name: 'cut-hair', seenLive: false },
  { value: 5, name: 'air-dry', seenLive: false },
  { value: 7, name: 'rewash', seenLive: false },
];

export function vacuumStationMode(value: number): VacuumStationMode | null {
  return STATION_MODES.find((mode) => mode.value === value) ?? null;
}

export function vacuumConsumables(): readonly VacuumConsumable[] {
  return CONSUMABLE_SOURCES.map((source) => ({
    id: source.id,
    service: source.service,
    level: vacuumProperty(source.service, source.level),
    leftTime: vacuumProperty(source.service, source.leftTime),
    reset: vacuumAction(source.service, source.reset),
  }));
}

export function vacuumStationFunctions(): readonly VacuumStationFunction[] {
  return STATION_SOURCES.map((source) => ({
    id: source.id,
    start: vacuumAction(source.service, source.start),
    stop: source.stop === null ? null : vacuumAction(source.service, source.stop),
    doneEvent: source.doneEvent,
    mode: source.mode,
  }));
}
