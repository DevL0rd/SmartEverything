import type { ConditionV2, StepV2, TriggerV2 } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { useDevices } from '../../../store/selectors';
import type { StepKind, TriggerKind } from '../model/blanks';
import type { DeviceLike } from '../model/capability-choices';
import {
  CONDITION_LABELS,
  type CardKind,
  STEP_LABELS,
  TRIGGER_LABELS,
  conditionKindOf,
  triggerKindOf,
} from '../model/kind-labels';
import { deviceIconOf } from './action-kinds';

export interface KindLook {
  readonly label: string;
  readonly icon: IconName;
  readonly help: string;
  readonly group: string;
}

export const TRIGGER_LOOKS: Readonly<Record<TriggerKind, KindLook>> = {
  time: {
    label: TRIGGER_LABELS.time,
    icon: 'clock',
    help: 'At a set time on the days you pick.',
    group: 'Time',
  },
  sun: {
    label: TRIGGER_LABELS.sun,
    icon: 'sunrise',
    help: 'Around sunrise or sunset.',
    group: 'Time',
  },
  every: {
    label: TRIGGER_LABELS.every,
    icon: 'timer',
    help: 'Again and again, like every 30 minutes.',
    group: 'Time',
  },
  device: {
    label: TRIGGER_LABELS.device,
    icon: 'activity',
    help: 'A device reading changes or crosses a level.',
    group: 'Things that happen',
  },
  event: {
    label: TRIGGER_LABELS.event,
    icon: 'bell',
    help: 'Motion, a doorbell, a button press and more.',
    group: 'Things that happen',
  },
  weather: {
    label: TRIGGER_LABELS.weather,
    icon: 'cloudRain',
    help: 'The weather or forecast changes.',
    group: 'Things that happen',
  },
  signal: {
    label: TRIGGER_LABELS.signal,
    icon: 'radio',
    help: 'Health, chats, Values and other signals.',
    group: 'Things that happen',
  },
  speech: {
    label: TRIGGER_LABELS.speech,
    icon: 'messageCircle',
    help: 'Someone says certain words.',
    group: 'Things that happen',
  },
};

export const CONDITION_LOOKS: Readonly<Record<CardKind, KindLook>> = {
  compare: {
    label: CONDITION_LABELS.compare,
    icon: 'activity',
    help: 'A device reading, a Value, an input or the weather.',
    group: 'Conditions',
  },
  time: {
    label: CONDITION_LABELS.time,
    icon: 'clock',
    help: 'Between two times and on certain days.',
    group: 'Conditions',
  },
  daylight: {
    label: CONDITION_LABELS.daylight,
    icon: 'sun',
    help: 'Daytime or after dark.',
    group: 'Conditions',
  },
  any: {
    label: CONDITION_LABELS.any,
    icon: 'layers',
    help: 'A group where one of several conditions is enough.',
    group: 'Conditions',
  },
  all: {
    label: CONDITION_LABELS.all,
    icon: 'layers',
    help: 'A group where every condition must hold.',
    group: 'Conditions',
  },
  not: {
    label: CONDITION_LABELS.not,
    icon: 'ban',
    help: 'Holds when the condition inside does not.',
    group: 'Conditions',
  },
};

export const STEP_LOOKS: Readonly<Record<StepKind, KindLook>> = {
  set: {
    label: STEP_LABELS.set,
    icon: 'power',
    help: 'Change a device, several devices, a room or a group.',
    group: 'Devices',
  },
  audio: {
    label: STEP_LABELS.audio,
    icon: 'volume',
    help: 'Volume, mute or output, for the whole computer or one app.',
    group: 'Computers',
  },
  display: {
    label: STEP_LABELS.display,
    icon: 'monitor',
    help: 'Resolution, scale, brightness, night light or position.',
    group: 'Computers',
  },
  scene: {
    label: STEP_LABELS.scene,
    icon: 'sparkles',
    help: 'Apply a saved scene.',
    group: 'Devices',
  },
  wait: {
    label: STEP_LABELS.wait,
    icon: 'timer',
    help: 'Pause before the next step.',
    group: 'Flow',
  },
  if: {
    label: STEP_LABELS.if,
    icon: 'route',
    help: 'Do different things depending on a condition.',
    group: 'Flow',
  },
  repeat: {
    label: STEP_LABELS.repeat,
    icon: 'refresh',
    help: 'Do steps again, a number of times or while something is true.',
    group: 'Flow',
  },
  stop: {
    label: STEP_LABELS.stop,
    icon: 'square',
    help: 'End this run or another automation’s runs.',
    group: 'Flow',
  },
  value: {
    label: STEP_LABELS.value,
    icon: 'customize',
    help: 'Set, toggle or step a remembered Value.',
    group: 'Values and routines',
  },
  run: {
    label: STEP_LABELS.run,
    icon: 'layers',
    help: 'Start reusable steps or another automation.',
    group: 'Values and routines',
  },
  notify: {
    label: STEP_LABELS.notify,
    icon: 'bell',
    help: 'Show a message on your phones.',
    group: 'AI and messages',
  },
  ai: {
    label: STEP_LABELS.ai,
    icon: 'bot',
    help: 'Ask the AI to take over from here.',
    group: 'AI and messages',
  },
  tool: {
    label: STEP_LABELS.tool,
    icon: 'wrench',
    help: 'Use any tool the AI has, with its exact arguments.',
    group: 'AI and messages',
  },
  speak: {
    label: STEP_LABELS.speak,
    icon: 'volume',
    help: 'Say words once through a camera’s speaker.',
    group: 'AI and messages',
  },
};

export function triggerIcon(trigger: TriggerV2, devices: readonly DeviceLike[]): IconName {
  const kind = triggerKindOf(trigger);
  if (trigger.on === 'sun') return trigger.event === 'sunrise' ? 'sunrise' : 'sunset';
  if (trigger.on === 'signal' && trigger.subject !== undefined && kind !== 'weather') {
    const device = devices.find((candidate) => candidate.id === trigger.subject);
    if (device !== undefined) return deviceIconOf(devices, device.id);
  }
  return TRIGGER_LOOKS[kind].icon;
}

export function triggerV2Icon(trigger: TriggerV2 | null, devices: readonly DeviceLike[]): IconName {
  return trigger === null ? 'play' : triggerIcon(trigger, devices);
}

export function conditionIcon(condition: ConditionV2): IconName {
  return CONDITION_LOOKS[conditionKindOf(condition)].icon;
}

export function stepIcon(step: StepV2, devices: readonly DeviceLike[]): IconName {
  if (step.do === 'set' && 'device' in step.target)
    return deviceIconOf(devices, step.target.device);
  return STEP_LOOKS[step.do].icon;
}

export function useDeviceIcon(): (deviceId: string) => IconName {
  const devices = useDevices({ includeHidden: true });
  return (deviceId) => deviceIconOf(devices, deviceId);
}
