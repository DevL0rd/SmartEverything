import {
  humanizeEnum,
  type AutomationValueRow,
  type OperandV2,
  type TargetV2,
} from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';
import { subjectLabel, subjectOf } from './present';

interface Named {
  readonly id: string;
  readonly name: string;
}

export interface Names {
  readonly devices: readonly DeviceLike[];
  readonly values?: readonly AutomationValueRow[];
  readonly automations?: readonly Named[];
  readonly groups?: readonly Named[];
  readonly rooms?: readonly Named[];
  readonly scenes: readonly Named[];
  readonly people: readonly Named[];
  readonly chats: readonly { readonly id: string; readonly title: string }[];
}

const GONE_DEVICE = 'a removed device';

export function deviceName(names: Names, deviceId: string): string {
  return names.devices.find((device) => device.id === deviceId)?.label ?? GONE_DEVICE;
}

export function valueName(names: Names, id: string): string {
  return names.values?.find((row) => row.id === id)?.content.name ?? 'a removed Value';
}

export function automationName(names: Names, id: string): string {
  return names.automations?.find((row) => row.id === id)?.name ?? 'a removed automation';
}

export function personName(names: Names, id: string): string {
  return names.people.find((row) => row.id === id)?.name ?? 'someone removed';
}

export function targetPhrase(names: Names, target: TargetV2): string {
  if ('device' in target) return deviceName(names, target.device);
  if ('devices' in target) return target.devices.map((id) => deviceName(names, id)).join(', ');
  if ('group' in target)
    return names.groups?.find((row) => row.id === target.group)?.name ?? 'a removed group';
  return names.rooms?.find((row) => row.id === target.room)?.name ?? 'a removed room';
}

function readingPhrase(names: Names, deviceId: string, control: string): string {
  const subject = subjectOf(names.devices, deviceId, control);
  return `${subject.device?.label ?? GONE_DEVICE} ${subjectLabel(subject)}`;
}

export function operandName(names: Names, operand: OperandV2): string {
  if ('device' in operand) return readingPhrase(names, operand.device, operand.control);
  if ('value' in operand) return valueName(names, operand.value);
  if ('input' in operand) return `input “${operand.input}”`;
  if ('weather' in operand) return humanizeEnum(operand.weather).toLowerCase();
  return JSON.stringify(operand.literal);
}
