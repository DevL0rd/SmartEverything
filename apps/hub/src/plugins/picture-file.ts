import { readFile } from 'node:fs/promises';
import { imageAttachmentOf } from '../assistant/image-attachment';
import type { HostStore } from '../store/host/host-store';
import type { Store } from '../store/store';
import { StoreNotFoundError } from '../store/context';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { storeUnit } from '../store/host/unit';
import { deviceIdReachable, scopesOf } from '../server/person-scope-units';
import type { PluginFiles } from './builtin/contract';

export interface PictureLookup {
  readonly pictureId: string;
  readonly role: string;
  readonly profileId: string;
}

export type PictureFound =
  | { readonly kind: 'recording'; readonly storagePath: string }
  | { readonly kind: 'attachment'; readonly file: StoredAttachment }
  | { readonly kind: 'refused' };

type PictureStore = Pick<
  HostStore,
  'cameras' | 'devices' | 'personAccess' | 'localDevices' | 'assistantChat'
>;

function snapshotOf(
  store: PictureStore,
  { pictureId, role, profileId }: PictureLookup,
): PictureFound | undefined {
  let row: ReturnType<HostStore['cameras']['recording']>;
  try {
    row = store.cameras.recording(pictureId);
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
  if (row.kind !== 'snapshot') return { kind: 'refused' };
  if (role !== 'owner') {
    const scope = scopesOf(store, profileId).devices;
    if (!deviceIdReachable(store, scope, row.device_id)) return { kind: 'refused' };
  }
  return { kind: 'recording', storagePath: row.storage_path };
}

export function pictureOf(store: PictureStore, lookup: PictureLookup): PictureFound {
  const snapshot = snapshotOf(store, lookup);
  if (snapshot !== undefined) return snapshot;
  const file = imageAttachmentOf(store.assistantChat, lookup.pictureId);
  if (file === undefined) return { kind: 'refused' };
  if (lookup.role !== 'owner' && file.profile_id !== lookup.profileId) return { kind: 'refused' };
  return { kind: 'attachment', file };
}

export const PLUGIN_PICTURE_UNIT = storeUnit(pictureOf);

export function pictureFileReader(ports: {
  readonly store: Pick<Store, 'host'>;
  readonly recordingPath: (storagePath: string) => string;
  readonly attachmentPath: (file: Pick<StoredAttachment, 'id' | 'profile_id' | 'name'>) => string;
}): PluginFiles['fromPicture'] {
  return async (caller, pictureId) => {
    const found = await ports.store.host.read('pluginPicture', {
      pictureId,
      role: caller.role,
      profileId: caller.profileId,
    });
    if (found.kind === 'refused') return null;
    const path =
      found.kind === 'recording'
        ? ports.recordingPath(found.storagePath)
        : ports.attachmentPath(found.file);
    return { data: await readFile(path), name: `Picture ${pictureId}` };
  };
}
