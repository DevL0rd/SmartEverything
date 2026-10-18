import {
  CommandRefusedError,
  MACHINE_ACTION_SUPPORTS,
  PHONE_DIRECT_ACTION,
  machineActionOfCapability,
  machineActionOfPhoneAction,
  machineActionRefusal,
  machineOpenTargetOf,
  type DeviceCommand,
  type DeviceRow,
  type JsonValue,
  type MachineOpenTarget,
  type PhoneActionOrigin,
  type PhoneDirectAction,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { DeviceDriver } from '../local/device-driver';
import type { Store } from '../store/store';
import type { PhoneActionBroker } from './phone-actions';
import type { PhoneNodes } from './phone-nodes';
import { clientIdOfPhone, PHONE_DRIVER, PHONE_REPORTED_ACTIONS } from './phone-device';

class PhoneActionFailedError extends Error {
  override readonly name = 'PhoneActionFailedError';
}

function openTargetOf(text: string): MachineOpenTarget {
  try {
    return machineOpenTargetOf(text);
  } catch (cause) {
    throw new CommandRefusedError('open', cause instanceof Error ? cause.message : String(cause));
  }
}

function openFields(text: string): Readonly<Record<string, unknown>> {
  const target = openTargetOf(text);
  if (target.kind === 'path') {
    throw new CommandRefusedError('open', 'a phone opens links; send a file to it instead');
  }
  return { url: target.url, label: new URL(target.url).hostname };
}

interface PhoneCommand {
  readonly type: PhoneDirectAction['type'];
  readonly fields: (value: JsonValue) => Readonly<Record<string, unknown>>;
}

const NO_FIELDS = (): Readonly<Record<string, unknown>> => ({});

const COMMANDS: Readonly<Record<string, PhoneCommand>> = {
  volume: { type: 'set_volume', fields: (value) => ({ stream: 'media', percent: value }) },
  ring_volume: { type: 'set_volume', fields: (value) => ({ stream: 'ring', percent: value }) },
  alarm_volume: { type: 'set_volume', fields: (value) => ({ stream: 'alarm', percent: value }) },
  notification_volume: {
    type: 'set_volume',
    fields: (value) => ({ stream: 'notification', percent: value }),
  },
  brightness: { type: 'set_brightness', fields: (value) => ({ percent: value }) },
  auto_brightness: { type: 'set_auto_brightness', fields: (value) => ({ on: value }) },
  ringer_mode: { type: 'set_ringer', fields: (value) => ({ mode: value }) },
  dnd: { type: 'set_dnd', fields: (value) => ({ on: value }) },
  playback: {
    type: 'media',
    fields: (value) => ({ key: value === 'playing' ? 'play' : 'pause' }),
  },
  ring: { type: 'ring', fields: () => ({ on: true }) },
  flashlight: { type: 'flashlight', fields: (value) => ({ mode: value }) },
  stop_ring: { type: 'ring', fields: () => ({ on: false }) },
  lock_screen: { type: 'lock', fields: NO_FIELDS },
  show_unlock: { type: 'show_unlock', fields: NO_FIELDS },
  launch_app: { type: 'launch_app', fields: (value) => ({ app: value }) },
  open: { type: 'open_url', fields: (value) => openFields(z.string().parse(value)) },
};

function assertReady(command: DeviceCommand, device: DeviceRow): void {
  const action = machineActionOfCapability(command.capability);
  if (action === null || !PHONE_REPORTED_ACTIONS.includes(action)) {
    return;
  }
  const reported = MACHINE_ACTION_SUPPORTS.safeParse(device.details['machineActions']);
  const refusal = machineActionRefusal(reported.success ? reported.data : [], action);
  if (refusal !== null) {
    throw new CommandRefusedError(command.capability, refusal);
  }
}

function commandOf(capability: string): PhoneCommand {
  const command = COMMANDS[capability];
  if (command === undefined) {
    throw new CommandRefusedError(capability, 'a phone cannot change this');
  }
  return command;
}

export function phoneActionTypeOf(capability: string): PhoneDirectAction['type'] | undefined {
  return COMMANDS[capability]?.type;
}

export function phoneActionOfCommand(capability: string, value: JsonValue): PhoneDirectAction {
  const command = commandOf(capability);
  return PHONE_DIRECT_ACTION.parse({ type: command.type, ...command.fields(value) });
}

export interface PhoneDriverOptions {
  readonly store: Pick<Store, 'devices'>;
  readonly actions: Pick<PhoneActionBroker, 'run'>;
  readonly phones: Pick<PhoneNodes, 'recordAction'>;
  readonly originOf: (commandId: string) => PhoneActionOrigin;
  readonly now: () => Date;
}

function recordAction(
  options: PhoneDriverOptions,
  device: DeviceRow,
  action: PhoneDirectAction,
  origin: PhoneActionOrigin,
): void {
  const machine = machineActionOfPhoneAction(action);
  if (machine === null) {
    return;
  }
  options.phones.recordAction(device, machine, origin, options.now());
}

export function phoneDriver(options: PhoneDriverOptions): DeviceDriver {
  return {
    id: PHONE_DRIVER,
    start: () => Promise.resolve(() => Promise.resolve()),
    execute: async (command: DeviceCommand): Promise<JsonValue> => {
      const clientId = clientIdOfPhone(command.externalId);
      if (clientId === null) {
        throw new CommandRefusedError(command.capability, `${command.externalId} is not a phone`);
      }
      const device = options.store.devices.byExternal('local', command.externalId);
      if (device === undefined) {
        throw new CommandRefusedError(command.capability, 'this phone is no longer paired');
      }
      assertReady(command, device);
      const action = phoneActionOfCommand(command.capability, command.value);
      const origin = options.originOf(command.commandId);
      const result = await options.actions.run(
        { clientId, name: device.display_name ?? device.name },
        action,
        origin,
      );
      if (!result.ok) {
        throw new PhoneActionFailedError(result.detail);
      }
      recordAction(options, device, action, origin);
      return result.detail;
    },
  };
}
