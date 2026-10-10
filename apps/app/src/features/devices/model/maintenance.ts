import { inTier, withRole, type PresentedCapability } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { hasValue, valueOf, type DeviceModel } from './device-model';

export interface FilterItem {
  readonly kind: 'filter';
  readonly life: PresentedCapability;
  readonly lifeValue: number;
  readonly daysLeft: number | null;
  readonly reset: PresentedCapability | null;
}

export interface StatusItem {
  readonly kind: 'status';
  readonly presented: PresentedCapability;
  readonly fault: boolean;
}

export interface ActionItem {
  readonly kind: 'action';
  readonly presented: PresentedCapability;
}

export type MaintenanceItem = FilterItem | StatusItem | ActionItem;

const HEALTHY_FAULT = /^no faults?$/i;
const RUNNING = /progress|running|cleaning/i;
const STOP_ACTION = /^stop\b/i;
const COUNTDOWN = /left|remaining/i;
const FILTER_ROLES = new Set(['filter_life', 'filter_days_left', 'filter_reset']);

function filterItem(model: DeviceModel, values: DeviceValues): FilterItem | null {
  const life = withRole(model.presentation, 'filter_life');
  const lifeValue = valueOf(values, life);
  if (life === undefined || typeof lifeValue !== 'number') {
    return null;
  }
  const days = valueOf(values, withRole(model.presentation, 'filter_days_left'));
  const reset = withRole(model.presentation, 'filter_reset');
  return {
    kind: 'filter',
    life,
    lifeValue,
    daysLeft: typeof days === 'number' ? days : null,
    reset: reset?.writable === true ? reset : null,
  };
}

function statusShown(presented: PresentedCapability, values: DeviceValues): boolean {
  const value = valueOf(values, presented);
  if (value === undefined) {
    return false;
  }
  if (presented.role === 'fault') {
    return typeof value === 'string' && !HEALTHY_FAULT.test(value);
  }
  return !(value === 0 && COUNTDOWN.test(presented.label));
}

function isRunning(statuses: readonly PresentedCapability[], values: DeviceValues): boolean {
  return statuses.some((presented) => {
    const value = valueOf(values, presented);
    return typeof value === 'string' && RUNNING.test(value);
  });
}

export function maintenanceOf(
  model: DeviceModel,
  values: DeviceValues,
): readonly MaintenanceItem[] {
  const rest = inTier(model.presentation, 'maintenance').filter(
    (presented) => presented.role === null || !FILTER_ROLES.has(presented.role),
  );
  const statuses = rest.filter((presented) => presented.capability.value.kind !== 'action');
  const running = isRunning(statuses, values);
  const filter = filterItem(model, values);
  return [
    ...(filter === null ? [] : [filter]),
    ...statuses
      .filter((presented) => hasValue(values, presented) && statusShown(presented, values))
      .map((presented): StatusItem => ({
        kind: 'status',
        presented,
        fault: presented.role === 'fault',
      })),
    ...rest
      .filter(
        (presented) =>
          presented.capability.value.kind === 'action' &&
          presented.writable &&
          STOP_ACTION.test(presented.label) === running,
      )
      .map((presented): ActionItem => ({ kind: 'action', presented })),
  ];
}
