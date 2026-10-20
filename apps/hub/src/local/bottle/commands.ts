import {
  BOTTLE_CLOCK,
  BOTTLE_QUIET_STATE,
  BOTTLE_REMINDER_INTERVAL,
  BOTTLE_REMINDER_STATE,
  CommandRefusedError,
  HSV_COLOR,
  bottleHexOfChannels,
  hsvToRgbChannels,
  type BottlePushAction,
  type BottleQuietChange,
  type BottleReminderChange,
  type DeviceCommand,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { Store } from '../../store/store';
import type { DeviceDriver } from '../device-driver';
import type { BottleActions } from './actions';
import { standingOf } from './access';
import { BOTTLE_DRIVER, entryConfigOf, saveConfig } from './config';

const CHANNEL_MAX = 255;

const OWNER_SOURCES: ReadonlySet<string> = new Set(['automation', 'scene']);

class BottleCommandFailedError extends Error {
  override readonly name = 'BottleCommandFailedError';
}

export type Intent =
  | { readonly kind: 'reminder'; readonly change: BottleReminderChange }
  | { readonly kind: 'quiet'; readonly change: BottleQuietChange }
  | {
      readonly kind: 'action';
      readonly action: Extract<BottlePushAction, 'sync_now' | 'measure' | 'uv_stop'>;
    };

function value<T>(command: DeviceCommand, schema: z.ZodType<T>, words: string): T {
  const parsed = schema.safeParse(command.value);
  if (!parsed.success) {
    throw new CommandRefusedError(command.capability, `it needs ${words}`);
  }
  return parsed.data;
}

function colourOf(command: DeviceCommand): string {
  const { r, g, b } = hsvToRgbChannels(value(command, HSV_COLOR, 'a colour'));
  return bottleHexOfChannels({
    red: r / CHANNEL_MAX,
    green: g / CHANNEL_MAX,
    blue: b / CHANNEL_MAX,
  });
}

type IntentMaker = (command: DeviceCommand) => Intent;

const INTENTS: Readonly<Record<string, IntentMaker>> = {
  hydration_reminder: (command) => ({
    kind: 'reminder',
    change: { state: value(command, BOTTLE_REMINDER_STATE, 'off or interval_fixed') },
  }),
  reminder_interval: (command) => ({
    kind: 'reminder',
    change: {
      intervalMin: value(command, BOTTLE_REMINDER_INTERVAL, 'minutes from 15 to 120 in steps of 5'),
    },
  }),
  reminder_from: (command) => ({
    kind: 'reminder',
    change: { from: value(command, BOTTLE_CLOCK, 'a time such as 08:00') },
  }),
  reminder_to: (command) => ({
    kind: 'reminder',
    change: { to: value(command, BOTTLE_CLOCK, 'a time such as 21:00') },
  }),
  reminder_colour: (command) => ({ kind: 'reminder', change: { colour: colourOf(command) } }),
  quiet_hours: (command) => ({
    kind: 'quiet',
    change: { state: value(command, BOTTLE_QUIET_STATE, 'off, on or auto') },
  }),
  quiet_from: (command) => ({
    kind: 'quiet',
    change: { from: value(command, BOTTLE_CLOCK, 'a time such as 22:00') },
  }),
  quiet_to: (command) => ({
    kind: 'quiet',
    change: { to: value(command, BOTTLE_CLOCK, 'a time such as 07:00') },
  }),
  uv_clean: (command) => {
    if (command.value !== 'stop') {
      throw new CommandRefusedError(
        command.capability,
        'only stop is allowed here; starting a clean needs a person holding the Clean button at the bottle',
      );
    }
    return { kind: 'action', action: 'uv_stop' };
  },
  bottle_sync: () => ({ kind: 'action', action: 'sync_now' }),
  measure_level: () => ({ kind: 'action', action: 'measure' }),
};

export function intentOf(command: DeviceCommand): Intent {
  const make = INTENTS[command.capability];
  if (make === undefined) {
    throw new CommandRefusedError(command.capability, 'the bottle cannot change this');
  }
  return make(command);
}

export interface CommandDeps {
  readonly store: Store;
  readonly actions: Pick<BottleActions, 'run'>;
  readonly log: Logger;
}

function assertMay(deps: CommandDeps, command: DeviceCommand, entry: LocalDeviceEntry): void {
  const row = deps.store.commands.byId(command.commandId);
  if (OWNER_SOURCES.has(row.source) || row.requested_by === null) {
    return;
  }
  const client = deps.store.clients.byId(row.requested_by);
  const standing = standingOf(
    { role: client.role, profileId: deps.store.profiles.activeOf(client.id).id },
    entryConfigOf(entry),
  );
  if (standing === 'none') {
    throw new CommandRefusedError(
      command.capability,
      'only the owner and the person this bottle belongs to change it',
    );
  }
}

function saveWish(deps: CommandDeps, entry: LocalDeviceEntry, intent: Intent): void {
  const config = entryConfigOf(entry);
  if (intent.kind === 'reminder') {
    saveConfig(deps.store, entry, {
      ...config,
      desired: { ...config.desired, reminder: { ...config.desired.reminder, ...intent.change } },
    });
  } else if (intent.kind === 'quiet') {
    saveConfig(deps.store, entry, {
      ...config,
      desired: { ...config.desired, quiet: { ...config.desired.quiet, ...intent.change } },
    });
  }
}

export async function runBottleCommand(
  deps: CommandDeps,
  command: DeviceCommand,
): Promise<JsonValue> {
  const device = deps.store.devices.byExternal('local', command.externalId);
  if (device === undefined) {
    throw new CommandRefusedError(command.capability, 'this bottle is no longer known to the hub');
  }
  const entry = deps.store.localDevices.byExternalId(command.externalId);
  const intent = intentOf(command);
  assertMay(deps, command, entry);
  if (intent.kind !== 'action') {
    saveWish(deps, entry, intent);
    deps.log.info('bottle.setting_saved', { device: device.id, capability: command.capability });
    return 'Saved. It applies when the bottle next wakes.';
  }
  const result = await deps.actions.run(device, entry, intent.action);
  if (!result.ok) {
    throw new BottleCommandFailedError(result.detail);
  }
  return result.detail;
}

export function bottleDriver(deps: CommandDeps, start: DeviceDriver['start']): DeviceDriver {
  return {
    id: BOTTLE_DRIVER,
    start,
    execute: (command) => runBottleCommand(deps, command),
  };
}
