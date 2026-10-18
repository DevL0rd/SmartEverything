import { z } from 'zod';
import type { Store } from '../store/store';
import type { CommandOrigin } from './computer-commands';
import { NotAComputerError } from './computer-errors';

const COMPUTER_DETAILS = z.object({
  interfaces: z.array(z.object({ mac: z.string().min(1) })),
});

export function commandOrigin(
  store: Pick<Store, 'commands' | 'clients'>,
): (commandId: string) => CommandOrigin {
  return (commandId) => {
    const row = store.commands.byId(commandId);
    const client = row.requested_by === null ? null : store.clients.byId(row.requested_by).name;
    return { source: row.source, client, clientId: row.requested_by };
  };
}

export function computerMacs(store: Pick<Store, 'devices'>): (deviceId: string) => string[] {
  return (deviceId) => {
    const details = COMPUTER_DETAILS.safeParse(store.devices.byId(deviceId).details);
    if (!details.success) {
      throw new NotAComputerError();
    }
    return details.data.interfaces.map((item) => item.mac);
  };
}
