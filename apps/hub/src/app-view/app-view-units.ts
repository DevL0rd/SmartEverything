import type { ClientRow } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';

export interface AppViewClient {
  readonly client: ClientRow;
  readonly profileId: string;
}

export const APP_VIEW_CLIENTS_UNIT = storeUnit(
  ({ clients, profiles }, _input: null): AppViewClient[] =>
    clients.list().map((client) => ({ client, profileId: profiles.activeOf(client.id).id })),
);
