import { z } from 'zod';
import {
  CommandRefusedError,
  PRINTER_KEYS,
  type DeviceCommand,
  type JsonValue,
} from '@smarteverything/domain';
import type { DeviceDriver, DeviceDriverContext } from '../../../local/device-driver';
import type { ToolCaller } from '../contract';
import type { SessionActions } from './actions';
import type { PrinterRegistry } from './registry';

export const PRINTER_DRIVER_ID = 'printer';

const SYSTEM_CALLER: ToolCaller = {
  profileId: 'system',
  role: 'owner',
  chatId: null,
  via: 'plugin',
  clientId: null,
};

export interface DriverDeps {
  readonly registry: PrinterRegistry;
  readonly actions: SessionActions;
  readonly attached: (context: DeviceDriverContext) => () => Promise<void>;
}

const HOW = z.object({ how: z.string() });

function howOf(value: JsonValue): string | undefined {
  const parsed = HOW.safeParse(value);
  return parsed.success ? parsed.data.how : undefined;
}

export function printerDriver(deps: DriverDeps): DeviceDriver {
  return {
    id: PRINTER_DRIVER_ID,
    start: (context) => Promise.resolve(deps.attached(context)),
    execute: async (command: DeviceCommand): Promise<JsonValue> => {
      const session = deps.registry
        .list()
        .find((candidate) => candidate.externalId === command.externalId);
      if (session === undefined)
        throw new CommandRefusedError(command.capability, 'this printer is not available');
      if (command.capability === PRINTER_KEYS.testPage) {
        const printed = await deps.actions.testPage(session, SYSTEM_CALLER);
        return { printed: printed.job?.key ?? null };
      }
      if (command.capability === PRINTER_KEYS.identify) {
        await deps.actions.identify(session, SYSTEM_CALLER, howOf(command.value));
        return { identifying: true };
      }
      if (command.capability === PRINTER_KEYS.queue) {
        await deps.actions.pauseResume(session, SYSTEM_CALLER, command.value === 'paused');
        return { queue: command.value };
      }
      throw new CommandRefusedError(
        command.capability,
        'a printer only takes test page, find, and queue changes',
      );
    },
  };
}
