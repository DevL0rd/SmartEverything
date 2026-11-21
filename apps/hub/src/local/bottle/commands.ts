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
import type { FleetRoster } from '../fleet-roster';
import type { BottleActions } from './actions';
import { standingOf } from './access';
import { BOTTLE_DRIVER, entryConfigOf, storedConfigOf, type BottleEntryConfig } from './config';

const CHANNEL_MAX = 255;

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
  readonly store: Pick<Store, 'host'>;
  readonly roster: Pick<FleetRoster, 'deviceForEntry' | 'entryOf' | 'use'>;
  readonly actions: Pick<BottleActions, 'run'>;
  readonly log: Logger;
}

async function assertMay(
  deps: CommandDeps,
  command: DeviceCommand,
  entry: LocalDeviceEntry,
): Promise<void> {
  const actor = await deps.store.host.read('bottleCommandActor', command.commandId);
  if (actor === null) {
    return;
  }
  const standing = standingOf(actor, entryConfigOf(entry));
  if (standing === 'none') {
    throw new CommandRefusedError(
      command.capability,
      'only the owner and the person this bottle belongs to change it',
    );
  }
}

function wishedConfig(config: BottleEntryConfig, intent: Intent): BottleEntryConfig | null {
  if (intent.kind === 'reminder') {
    return {
      ...config,
      desired: { ...config.desired, reminder: { ...config.desired.reminder, ...intent.change } },
    };
  }
  if (intent.kind === 'quiet') {
    return {
      ...config,
      desired: { ...config.desired, quiet: { ...config.desired.quiet, ...intent.change } },
    };
  }
  return null;
}

async function saveWish(deps: CommandDeps, entry: LocalDeviceEntry, intent: Intent): Promise<void> {
  const wished = wishedConfig(entryConfigOf(entry), intent);
  if (wished !== null) {
    deps.roster.use(
      await deps.store.host.write('localConfig', {
        externalId: entry.externalId,
        config: storedConfigOf(wished),
      }),
    );
  }
}

export async function runBottleCommand(
  deps: CommandDeps,
  command: DeviceCommand,
): Promise<JsonValue> {
  const device = await deps.roster.deviceForEntry(command.externalId);
  if (device === undefined) {
    throw new CommandRefusedError(command.capability, 'this bottle is no longer known to the hub');
  }
  const entry = deps.roster.entryOf(command.externalId);
  const intent = intentOf(command);
  await assertMay(deps, command, entry);
  if (intent.kind !== 'action') {
    await saveWish(deps, entry, intent);
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
