import {
  CommandRefusedError,
  PHONE_ACTION,
  type DeviceCommand,
  type JsonValue,
  type PhoneAction,
} from '@smarteverything/domain';
import type { DeviceDriver } from '../local/device-driver';
import type { Store } from '../store/store';
import type { PhoneActionBroker } from './phone-actions';
import { clientIdOfPhone, PHONE_DRIVER } from './phone-device';

export class PhoneActionFailedError extends Error {
  override readonly name = 'PhoneActionFailedError';
}

const COMMANDS: Readonly<Record<string, (value: JsonValue) => unknown>> = {
  volume: (value) => ({ type: 'set_volume', stream: 'media', percent: value }),
  ringer_mode: (value) => ({ type: 'set_ringer', mode: value }),
  dnd: (value) => ({ type: 'set_dnd', on: value }),
  playback: (value) => ({ type: 'media', key: value === 'playing' ? 'play' : 'pause' }),
  ring: () => ({ type: 'ring', on: true }),
  flashlight: (value) => ({ type: 'flashlight', mode: value }),
};

function actionOf(command: DeviceCommand): PhoneAction {
  const build = COMMANDS[command.capability];
  if (build === undefined) {
    throw new CommandRefusedError(command.capability, 'a phone cannot change this');
  }
  return PHONE_ACTION.parse(build(command.value));
}

export interface PhoneDriverOptions {
  readonly store: Store;
  readonly actions: PhoneActionBroker;
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
      const device = options.store.devices
        .list()
        .find((row) => row.provider === 'local' && row.external_id === command.externalId);
      if (device === undefined) {
        throw new CommandRefusedError(command.capability, 'this phone is no longer paired');
      }
      const result = await options.actions.run(
        { clientId, name: device.display_name ?? device.name },
        actionOf(command),
        `command ${command.commandId}`,
      );
      if (!result.ok) {
        throw new PhoneActionFailedError(result.detail);
      }
      return result.detail;
    },
  };
}
