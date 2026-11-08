import { readFile } from 'node:fs/promises';
import { imageAttachmentOf } from '../assistant/image-attachment';
import type { Store } from '../store/store';
import { StoreNotFoundError } from '../store/context';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import { deviceIdReachable, scopesOf } from '../server/person-scope';
import type { PluginFiles } from './builtin/contract';

type Fetched = ReturnType<PluginFiles['fromPicture']>;

export function pictureFileReader(ports: {
  readonly store: Pick<
    Store,
    'cameras' | 'devices' | 'personAccess' | 'localDevices' | 'assistantChat'
  >;
  readonly recordingPath: (storagePath: string) => string;
  readonly attachmentPath: (file: Pick<StoredAttachment, 'id' | 'profile_id' | 'name'>) => string;
}): PluginFiles['fromPicture'] {
  const snapshot = async (
    ...[caller, pictureId]: Parameters<PluginFiles['fromPicture']>
  ): Promise<Awaited<Fetched> | undefined> => {
    let row: ReturnType<Store['cameras']['recording']>;
    try {
      row = ports.store.cameras.recording(pictureId);
    } catch (cause) {
      if (cause instanceof StoreNotFoundError) return undefined;
      throw cause;
    }
    if (row.kind !== 'snapshot') return null;
    if (caller.role !== 'owner') {
      const scope = scopesOf(ports.store, caller.profileId).devices;
      if (!deviceIdReachable(ports.store, scope, row.device_id)) return null;
    }
    return {
      data: await readFile(ports.recordingPath(row.storage_path)),
      name: `Picture ${pictureId}`,
    };
  };
  return async (caller, pictureId) => {
    const taken = await snapshot(caller, pictureId);
    if (taken !== undefined) return taken;
    const file = imageAttachmentOf(ports.store.assistantChat, pictureId);
    if (file === undefined) return null;
    if (caller.role !== 'owner' && file.profile_id !== caller.profileId) return null;
    return { data: await readFile(ports.attachmentPath(file)), name: `Picture ${pictureId}` };
  };
}
