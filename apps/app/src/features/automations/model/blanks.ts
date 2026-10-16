import type {
  LegacyAction as Action,
  CommandAction,
  Comparison,
  LegacyCondition as Condition,
  DeviceCapability,
  Trigger,
  ValueDescriptor,
} from '@smarteverything/domain';
import { genericSources, withKind } from './signal-triggers';
import {
  defaultValue,
  readableCapabilities,
  valueComparisonFor,
  writableCapabilities,
  type DeviceLike,
  type ValueComparison,
} from './capability-choices';

export const TRIGGER_TYPES = [
  'state',
  'event',
  'time',
  'sun',
  'interval',
  'weather',
  'weather_kind',
  'signal',
] as const;
export const CONDITION_TYPES = [
  'state',
  'time_window',
  'weekday',
  'weather',
  'weather_kind',
  'daylight',
] as const;
export const ACTION_TYPES = ['command', 'scene', 'delay', 'notify', 'wake_ai'] as const;

export type TriggerType = Trigger['type'];
export type ConditionType = Condition['type'];
export type ActionType = Action['type'];

export const EVERY_DAY: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS_ONLY: readonly number[] = [1, 2, 3, 4, 5];

export interface Choices {
  readonly devices: readonly DeviceLike[];
  readonly sceneIds: readonly string[];
  readonly wakeProfileId: string | null;
}

function triggerComparison(descriptor: ValueDescriptor): Comparison {
  switch (descriptor.kind) {
    case 'boolean':
    case 'enum':
      return valueComparisonFor('eq', descriptor, null);
    case 'number':
      return valueComparisonFor('gt', descriptor, null);
    case 'color':
    case 'text':
    case 'action':
      return { operator: 'changed' };
  }
}

function conditionComparison(descriptor: ValueDescriptor): ValueComparison {
  return valueComparisonFor(descriptor.kind === 'number' ? 'gt' : 'eq', descriptor, null);
}

interface Target {
  readonly device: DeviceLike;
  readonly capability: DeviceCapability;
}

function firstTarget(
  devices: readonly DeviceLike[],
  usable: (device: DeviceLike) => readonly DeviceCapability[],
): Target | null {
  for (const device of devices) {
    const capability = usable(device)[0];
    if (capability !== undefined) {
      return { device, capability };
    }
  }
  return null;
}

export function stateTrigger(
  device: DeviceLike,
  capability: DeviceCapability,
): Extract<Trigger, { type: 'state' }> {
  return {
    type: 'state',
    deviceId: device.id,
    capability: capability.key,
    comparison: triggerComparison(capability.value),
  };
}

export function stateCondition(device: DeviceLike, capability: DeviceCapability): Condition {
  return {
    type: 'state',
    deviceId: device.id,
    capability: capability.key,
    comparison: conditionComparison(capability.value),
  };
}

export function commandAction(device: DeviceLike, capability: DeviceCapability): CommandAction {
  return {
    type: 'command',
    deviceId: device.id,
    capability: capability.key,
    value: defaultValue(capability.value),
  };
}

function blankSignal(): Trigger | null {
  const source = genericSources()[0];
  const kind = source?.kinds[0];
  if (source === undefined || kind === undefined) {
    return null;
  }
  return withKind({ type: 'signal' }, source.source, kind);
}

function blankStateTrigger(choices: Choices): Trigger | null {
  const target = firstTarget(choices.devices, readableCapabilities);
  return target === null ? null : stateTrigger(target.device, target.capability);
}

export function blankTrigger(type: TriggerType, choices: Choices): Trigger | null {
  if (type === 'speech') return null;
  switch (type) {
    case 'state':
      return blankStateTrigger(choices);
    case 'event':
      return { type, deviceId: null, kind: 'motion' };
    case 'time':
      return { type, at: '07:00', weekdays: [...EVERY_DAY] };
    case 'sun':
      return { type, event: 'sunset', offsetMinutes: 0 };
    case 'interval':
      return { type, everyMinutes: 60 };
    case 'weather':
      return { type, metric: 'temperature', comparison: { operator: 'gt', value: 30 } };
    case 'weather_kind':
      return { type, kinds: ['rain', 'storm'] };
    case 'signal':
      return blankSignal();
  }
}

export function blankCondition(type: ConditionType, choices: Choices): Condition | null {
  switch (type) {
    case 'state': {
      const target = firstTarget(choices.devices, readableCapabilities);
      return target === null ? null : stateCondition(target.device, target.capability);
    }
    case 'time_window':
      return { type, after: '22:00', before: '06:00' };
    case 'weekday':
      return { type, weekdays: [...WEEKDAYS_ONLY] };
    case 'weather':
      return { type, metric: 'rain_chance', comparison: { operator: 'lt', value: 30 } };
    case 'weather_kind':
      return { type, kinds: ['clear', 'partly_cloudy'] };
    case 'daylight':
      return { type, is: 'night', sunriseOffsetMinutes: 0, sunsetOffsetMinutes: 0 };
  }
}

export function blankAction(type: ActionType, choices: Choices): Action | null {
  switch (type) {
    case 'command': {
      const target = firstTarget(choices.devices, writableCapabilities);
      return target === null ? null : commandAction(target.device, target.capability);
    }
    case 'scene': {
      const sceneId = choices.sceneIds[0];
      return sceneId === undefined ? null : { type, sceneId };
    }
    case 'delay':
      return { type, seconds: 60 };
    case 'notify':
      return { type, message: '' };
    case 'wake_ai':
      return choices.wakeProfileId === null
        ? null
        : { type, profileId: choices.wakeProfileId, chatId: null, instruction: '' };
    case 'tool':
      return null;
  }
}
