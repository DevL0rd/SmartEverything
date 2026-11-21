import type { GoogleSyncState } from '@smarteverything/domain';
import type { GoogleSyncResource } from '../store/repositories/google-sync-state';
import { storeUnit } from '../store/host/unit';
import type { GoogleAccountPatch } from '../store/repositories/google-accounts';

export interface ChannelChange {
  readonly resource: GoogleSyncResource;
  readonly channel: GoogleSyncState['channel'];
  readonly whileChannel: { readonly id: string | undefined } | null;
}

export const SET_GOOGLE_CHANNEL_UNIT = storeUnit(
  (store, { resource, channel, whileChannel }: ChannelChange): GoogleSyncState | undefined => {
    const fresh = store.googleSyncState.find(resource);
    if (fresh === undefined) return undefined;
    if (whileChannel !== null && fresh.channel?.channel_id !== whileChannel.id) return undefined;
    return store.googleSyncState.put({ ...fresh, channel });
  },
);

export interface SyncSettlement {
  readonly profileId: string;
  readonly change: GoogleAccountPatch;
}

export const SETTLE_GOOGLE_SYNC_UNIT = storeUnit(
  (store, { profileId, change }: SyncSettlement): void => {
    if (store.googleAccounts.find(profileId)?.status !== 'linked') return;
    store.googleAccounts.update(profileId, change);
  },
);
