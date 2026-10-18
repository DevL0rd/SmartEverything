import type { IconName } from '../../../components/icon';
import { sameJson } from '../../../store/same-json';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { remoteKeysOf } from '../model/remote-layout';
import {
  categoryOfLearned,
  categoryOfLibrary,
  CATEGORY_LOOKS,
  type RemoteCategory,
} from './remote-category';

export interface BlasterRemote {
  readonly id: string;
  readonly name: string;
  readonly category: RemoteCategory;
  readonly icon: IconName;
}

function remoteOf(id: string, name: string, category: RemoteCategory): BlasterRemote {
  return { id, name, category, icon: CATEGORY_LOOKS[category].icon };
}

export function remotesOfBlaster(state: StoreState, blasterId: string): readonly BlasterRemote[] {
  const library = rowsOf(state.tables.devices)
    .filter((device) => device.kind === 'ir_remote' && device.parent_id === blasterId)
    .map((device) =>
      remoteOf(
        device.id,
        device.label,
        categoryOfLibrary(device.label, remoteKeysOf(device.capabilities)),
      ),
    );
  const learned = rowsOf(state.tables.ir_remotes)
    .filter((remote) => remote.blaster_id === blasterId)
    .map((remote) => remoteOf(remote.id, remote.name, categoryOfLearned(remote.category)));
  return [...library, ...learned];
}

export interface BlasterRemoteSet {
  readonly remotes: readonly BlasterRemote[];
  readonly sentAt: string | null;
}

export function latestSend(
  remotes: readonly BlasterRemote[],
  state: Pick<StoreState, 'settings'>,
): string | null {
  let latest: string | null = null;
  for (const remote of remotes) {
    const at = state.settings?.ir_remotes[remote.id]?.sentAt ?? null;
    if (at !== null && (latest === null || at > latest)) {
      latest = at;
    }
  }
  return latest;
}

export function useBlasterRemotes(blasterId: string): BlasterRemoteSet {
  return useStoreSelector(
    (state) => {
      const remotes = remotesOfBlaster(state, blasterId);
      return { remotes, sentAt: latestSend(remotes, state) };
    },
    sameJson,
    [blasterId],
  );
}
