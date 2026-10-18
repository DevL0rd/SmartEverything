import type { LegacyAction as Action } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { deviceIcon } from '../../device-visuals';
import type { DeviceLike } from '../model/capability-choices';

export interface ActionLook {
  readonly label: string;
  readonly icon: IconName;
}

export const ACTION_KINDS: Readonly<Record<Action['type'], ActionLook>> = {
  command: { label: 'Control a device', icon: 'power' },
  scene: { label: 'Run a scene', icon: 'sparkles' },
  delay: { label: 'Wait', icon: 'timer' },
  notify: { label: 'Send a notice', icon: 'bell' },
  wake_ai: { label: 'Wake the AI', icon: 'sparkles' },
  tool: { label: 'Use a tool', icon: 'wrench' },
};

export function deviceIconOf(devices: readonly DeviceLike[], deviceId: string | null): IconName {
  const device = devices.find((candidate) => candidate.id === deviceId);
  return device === undefined ? 'alert' : deviceIcon(device);
}

export function actionIcon(action: Action, devices: readonly DeviceLike[]): IconName {
  return action.type === 'command'
    ? deviceIconOf(devices, action.deviceId)
    : ACTION_KINDS[action.type].icon;
}
