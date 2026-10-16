import {
  type LegacyAction as Action,
  type LegacyCondition as Condition,
  type Trigger,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { useDevices } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';
import type { DeviceLike } from '../model/capability-choices';
import { baseOf } from '../model/signal-triggers';

export interface KindLook {
  readonly label: string;
  readonly icon: IconName;
}

export const TRIGGER_KINDS: Readonly<Record<Trigger['type'], KindLook>> = {
  speech: { label: 'Speech contains', icon: 'messageCircle' },
  time: { label: 'Time', icon: 'clock' },
  sun: { label: 'Sunrise or sunset', icon: 'sunrise' },
  state: { label: 'Device changes', icon: 'activity' },
  event: { label: 'Event', icon: 'bell' },
  interval: { label: 'Repeat', icon: 'timer' },
  weather: { label: 'Weather reading', icon: 'thermometer' },
  weather_kind: { label: 'Weather turns', icon: 'cloudRain' },
  signal: { label: 'Something happens', icon: 'radio' },
};

export const CONDITION_KINDS: Readonly<Record<Condition['type'], KindLook>> = {
  state: { label: 'Device state', icon: 'activity' },
  time_window: { label: 'Time of day', icon: 'clock' },
  weekday: { label: 'Days', icon: 'calendar' },
  weather: { label: 'Weather reading', icon: 'thermometer' },
  weather_kind: { label: 'Weather', icon: 'weather' },
  daylight: { label: 'Day or night', icon: 'sun' },
};

export const ACTION_KINDS: Readonly<Record<Action['type'], KindLook>> = {
  command: { label: 'Control a device', icon: 'power' },
  scene: { label: 'Run a scene', icon: 'sparkles' },
  delay: { label: 'Wait', icon: 'timer' },
  notify: { label: 'Send a notice', icon: 'bell' },
  wake_ai: { label: 'Wake the AI', icon: 'sparkles' },
  tool: { label: 'Use a tool', icon: 'wrench' },
};

function iconOfDevice(devices: readonly DeviceLike[], deviceId: string | null): IconName {
  const device = devices.find((candidate) => candidate.id === deviceId);
  return device === undefined ? 'alert' : deviceIcon(device);
}

export function triggerIcon(trigger: Trigger, devices: readonly DeviceLike[]): IconName {
  const base = trigger.type === 'signal' ? baseOf(trigger) : trigger;
  return base === null ? TRIGGER_KINDS.signal.icon : untimedIcon(base, devices);
}

function untimedIcon(
  trigger: Exclude<Trigger, { type: 'signal' }>,
  devices: readonly DeviceLike[],
): IconName {
  if (trigger.type !== 'state' && trigger.type !== 'event' && trigger.type !== 'sun')
    return TRIGGER_KINDS[trigger.type].icon;
  switch (trigger.type) {
    case 'state':
      return iconOfDevice(devices, trigger.deviceId);
    case 'event':
      return trigger.deviceId === null ? 'bell' : iconOfDevice(devices, trigger.deviceId);
    case 'sun':
      return trigger.event === 'sunrise' ? 'sunrise' : 'sunset';
  }
}

export function conditionIcon(condition: Condition, devices: readonly DeviceLike[]): IconName {
  return condition.type === 'state'
    ? iconOfDevice(devices, condition.deviceId)
    : CONDITION_KINDS[condition.type].icon;
}

export function actionIcon(action: Action, devices: readonly DeviceLike[]): IconName {
  return action.type === 'command'
    ? iconOfDevice(devices, action.deviceId)
    : ACTION_KINDS[action.type].icon;
}

export function useDeviceIcon(): (deviceId: string) => IconName {
  const devices = useDevices({ includeHidden: true });
  return (deviceId) => iconOfDevice(devices, deviceId);
}
