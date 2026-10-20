import {
  CommandRefusedError,
  WATCH_SPORT,
  WATCH_WORKOUT_CONTROLS,
  type DeviceCommand,
  type JsonValue,
  type WatchActionRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../store/store';
import type { DeviceDriver } from './device-driver';
import type { WatchActionBroker } from './watch-actions';
import type { LocalWatches } from './watches';

export const WATCH_DRIVER = 'xiaomi_watch';

const CONTROL = z.enum(WATCH_WORKOUT_CONTROLS);

class WatchActionFailedError extends Error {
  override readonly name = 'WatchActionFailedError';
}

export function watchActionOfCommand(capability: string, value: JsonValue): WatchActionRequest {
  if (capability === 'watch_workout_start') {
    return { type: 'start_workout', sport: WATCH_SPORT.parse(value) };
  }
  if (capability === 'watch_workout_control') {
    const control = CONTROL.parse(value);
    return { type: control === 'finish' ? 'stop_workout' : `${control}_workout` };
  }
  throw new CommandRefusedError(capability, 'a watch cannot change this');
}

export interface WatchDriverOptions {
  readonly store: { readonly devices: Pick<Store['devices'], 'byExternal'> };
  readonly watches: Pick<LocalWatches, 'target'>;
  readonly actions: Pick<WatchActionBroker, 'run'>;
}

export function watchDriver(options: WatchDriverOptions): DeviceDriver {
  return {
    id: WATCH_DRIVER,
    start: () => Promise.resolve(() => Promise.resolve()),
    execute: async (command: DeviceCommand): Promise<JsonValue> => {
      const device = options.store.devices.byExternal('local', command.externalId);
      if (device === undefined) {
        throw new CommandRefusedError(command.capability, 'this watch is no longer added');
      }
      const action = watchActionOfCommand(command.capability, command.value);
      const result = await options.actions.run(
        options.watches.target(device),
        action,
        `command:${command.commandId}`,
      );
      if (!result.ok) {
        throw new WatchActionFailedError(result.detail);
      }
      return result.detail;
    },
  };
}
