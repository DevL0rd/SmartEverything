import { z } from 'zod';
import {
  EVENT_KIND_LABELS,
  isCamera,
  presentCapability,
  presentValue,
  type CommandRow,
  type EventRow,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import type { Device } from '../../../store/state';
import { eventLook } from './event-look';
import { deviceIcon } from '../../device-visuals';

export type ActivityCategory = 'devices' | 'cameras' | 'automations' | 'assistants';

export interface ActivityAtom {
  readonly id: string;
  readonly kind: 'command' | 'event';
  readonly group: string;
  readonly at: string;
  readonly deviceId: string | null;
  readonly name: string;
  readonly what: string;
  readonly topic: string;
  readonly by: string | null;
  readonly icon: IconName;
  readonly tone: Tone;
  readonly category: ActivityCategory;
  readonly failed: boolean;
}

export type DeviceLookup = ReadonlyMap<string, Device>;

const SOURCES: Readonly<Record<CommandRow['source'], string>> = {
  app: 'You',
  automation: 'An automation',
  scene: 'A scene',
  assistant: 'An assistant',
};

const SOURCE_CATEGORY: Readonly<Record<CommandRow['source'], ActivityCategory | null>> = {
  app: null,
  automation: 'automations',
  scene: 'automations',
  assistant: 'assistants',
};

const FAILED: ReadonlySet<CommandRow['status']> = new Set(['failed', 'expired']);

const AUTOMATION_RUN = z.object({
  name: z.string().min(1),
  outcome: z.enum(['succeeded', 'failed']).optional(),
});

function deviceCategory(device: Device | undefined): ActivityCategory {
  return device !== undefined && isCamera(device) ? 'cameras' : 'devices';
}

function automationAtom(event: EventRow): ActivityAtom {
  const details = AUTOMATION_RUN.safeParse(event.details);
  const failed = details.success && details.data.outcome === 'failed';
  return {
    id: `event:${event.id}`,
    kind: 'event',
    group: `automation:${details.success ? details.data.name : event.id}`,
    at: event.occurred_at,
    deviceId: null,
    name: details.success ? details.data.name : 'An automation',
    what: failed ? 'Didn’t finish' : 'Ran',
    topic: 'Ran',
    by: null,
    icon: failed ? 'alert' : 'automations',
    tone: failed ? 'critical' : 'variant',
    category: 'automations',
    failed,
  };
}

export function eventAtom(event: EventRow, devices: DeviceLookup): ActivityAtom | null {
  if (event.kind === 'automation_run') {
    return automationAtom(event);
  }
  const device = event.device_id === null ? undefined : devices.get(event.device_id);
  if (device === undefined) {
    return null;
  }
  const look = eventLook(event.kind);
  return {
    id: `event:${event.id}`,
    kind: 'event',
    group: `event:${device.id}:${event.kind}`,
    at: event.occurred_at,
    deviceId: device.id,
    name: device.label,
    what: EVENT_KIND_LABELS[event.kind],
    topic: EVENT_KIND_LABELS[event.kind],
    by: null,
    icon: look.icon,
    tone: look.tone,
    category: deviceCategory(device),
    failed: event.kind === 'fault' || event.kind === 'provider_error',
  };
}

function commandWhat(device: Device, command: CommandRow): { what: string; topic: string } {
  const capability = device.capabilities.find((candidate) => candidate.key === command.capability);
  if (capability === undefined) {
    return { what: 'A control that is gone', topic: 'A control that is gone' };
  }
  const presented = presentCapability(device, capability);
  const what =
    capability.value.kind === 'action'
      ? presented.label
      : `${presented.label} → ${presentValue({ ...presented, capability }, command.value)}`;
  return { what, topic: presented.label };
}

export function commandAtom(command: CommandRow, devices: DeviceLookup): ActivityAtom | null {
  const device = command.device_id === null ? undefined : devices.get(command.device_id);
  if (device === undefined) {
    return null;
  }
  const failed = FAILED.has(command.status);
  return {
    id: `command:${command.id}`,
    kind: 'command',
    group: `command:${device.id}:${command.source}`,
    at: command.finished_at ?? command.created_at,
    deviceId: device.id,
    name: device.label,
    ...commandWhat(device, command),
    by: SOURCES[command.source],
    icon: failed ? 'alert' : deviceIcon(device),
    tone: failed ? 'critical' : 'primary',
    category: SOURCE_CATEGORY[command.source] ?? deviceCategory(device),
    failed,
  };
}
