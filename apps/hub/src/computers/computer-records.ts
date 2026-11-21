import { z } from 'zod';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import type { CommandOrigin } from './computer-commands';
import { NotAComputerError } from './computer-errors';

const COMPUTER_DETAILS = z.object({
  interfaces: z.array(z.object({ mac: z.string().min(1) })),
});

export const COMMAND_ORIGIN_UNIT = storeUnit((store, commandId: string): CommandOrigin => {
  const row = store.commands.byId(commandId);
  const client = row.requested_by === null ? null : store.clients.byId(row.requested_by).name;
  return { source: row.source, client, clientId: row.requested_by };
});

export function commandOrigin(
  store: Pick<Store, 'host'>,
): (commandId: string) => Promise<CommandOrigin> {
  return (commandId) => store.host.read('commandOrigin', commandId);
}

export function computerMacs(store: Pick<Store, 'host'>): (deviceId: string) => Promise<string[]> {
  return async (deviceId) => {
    const device = await store.host.call('devices', 'byId', deviceId);
    const details = COMPUTER_DETAILS.safeParse(device.details);
    if (!details.success) {
      throw new NotAComputerError();
    }
    return details.data.interfaces.map((item) => item.mac);
  };
}
