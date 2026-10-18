import type {
  LegacyAction as Action,
  CommandAction,
  DeviceCapability,
} from '@smarteverything/domain';
import { defaultValue, writableCapabilities, type DeviceLike } from './capability-choices';

export const ACTION_TYPES = ['command', 'scene', 'delay', 'notify', 'wake_ai'] as const;

export type ActionType = Action['type'];

export interface Choices {
  readonly devices: readonly DeviceLike[];
  readonly sceneIds: readonly string[];
  readonly wakeProfileId: string | null;
}

interface Target {
  readonly device: DeviceLike;
  readonly capability: DeviceCapability;
}

function firstTarget(devices: readonly DeviceLike[]): Target | null {
  for (const device of devices) {
    const capability = writableCapabilities(device)[0];
    if (capability !== undefined) {
      return { device, capability };
    }
  }
  return null;
}

export function commandAction(device: DeviceLike, capability: DeviceCapability): CommandAction {
  return {
    type: 'command',
    deviceId: device.id,
    capability: capability.key,
    value: defaultValue(capability.value),
  };
}

function blankAiAction(type: 'wake_ai' | 'tool', profileId: string | null): Action | null {
  if (profileId === null) {
    return null;
  }
  return type === 'wake_ai'
    ? { type, profileId, chatId: null, instruction: '' }
    : { type, profileId, tool: '', args: {} };
}

export function blankAction(type: ActionType, choices: Choices): Action | null {
  switch (type) {
    case 'command': {
      const target = firstTarget(choices.devices);
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
    case 'tool':
      return blankAiAction(type, choices.wakeProfileId);
  }
}
