import { presentValue } from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { joinParts, plural } from '../../../format/text';
import { maintenanceOf, type MaintenanceItem } from '../../devices';
import { visualStateOf } from '../../device-visuals';
import type { ClimateSource } from './climate-devices';

const LOW_SUPPLY = 20;

export type SupplyKind = 'filter' | 'water' | 'fault';

export interface SupplyLine {
  readonly key: string;
  readonly kind: SupplyKind;
  readonly deviceId: string;
  readonly device: string;
  readonly label: string;
  readonly text: string;
  readonly level: number | null;
  readonly tone: StatusTone;
}

function levelTone(percent: number): StatusTone {
  if (percent < LOW_SUPPLY / 2) {
    return 'critical';
  }
  return percent < LOW_SUPPLY ? 'warning' : 'positive';
}

function itemLine(source: ClimateSource, item: MaintenanceItem): SupplyLine | null {
  const { device } = source.model;
  if (item.kind === 'filter') {
    const days = item.daysLeft === null ? null : `about ${plural(item.daysLeft, 'day')} left`;
    return {
      key: `${device.id}:filter`,
      kind: 'filter',
      deviceId: device.id,
      device: device.label,
      label: item.life.label,
      text: joinParts([presentValue(item.life, item.lifeValue), days]),
      level: item.lifeValue / 100,
      tone: levelTone(item.lifeValue),
    };
  }
  const value = item.kind === 'status' ? source.values[item.presented.key]?.value : undefined;
  if (item.kind === 'status' && item.fault && value !== undefined) {
    return {
      key: `${device.id}:${item.presented.key}`,
      kind: 'fault',
      deviceId: device.id,
      device: device.label,
      label: item.presented.label,
      text: presentValue(item.presented, value),
      level: null,
      tone: 'critical',
    };
  }
  return null;
}

function waterLine(source: ClimateSource): SupplyLine | null {
  const { device } = source.model;
  const state = visualStateOf(device, source.values);
  if (state.waterLevel === null && !state.waterLow) {
    return null;
  }
  const percent = state.waterLevel === null ? 0 : state.waterLevel * 100;
  const low = state.waterLow || percent < LOW_SUPPLY;
  return {
    key: `${device.id}:water`,
    kind: 'water',
    deviceId: device.id,
    device: device.label,
    label: 'Water tank',
    text: low ? 'Low, refill soon' : `${String(Math.round(percent))} %`,
    level: state.waterLevel,
    tone: low ? 'warning' : 'positive',
  };
}

export function suppliesOf(source: ClimateSource): readonly SupplyLine[] {
  const items = maintenanceOf(source.model, source.values).flatMap((item) => {
    const line = itemLine(source, item);
    return line === null ? [] : [line];
  });
  const water = waterLine(source);
  return water === null ? items : [...items, water];
}

export function needsAttention(line: SupplyLine): boolean {
  return line.tone !== 'positive';
}

const supplied = new WeakMap<ClimateSource, boolean>();

export function hasSupplies(source: ClimateSource): boolean {
  const known = supplied.get(source);
  if (known !== undefined) return known;
  const has = suppliesOf(source).length > 0;
  supplied.set(source, has);
  return has;
}
