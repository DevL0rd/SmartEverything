import type { DriveItem, DriveUpload, DriveUploadTarget } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ChangeEnv } from './changes';
import type { DriveActor } from './access';
import type { FileItem } from './file-item';
import { locate, type DriveWriteRoot } from './intents';
import { absent, freeNameAt, TusError, type TusCaller } from './uploads-tus-wire';

export interface Destination {
  readonly root: DriveWriteRoot;
  readonly folder: DriveItem | null;
  readonly item: FileItem | null;
}

export async function destinationOf(
  store: Pick<Store, 'host'>,
  target: DriveUploadTarget,
  caller: DriveActor,
): Promise<Destination> {
  const found = await store.host.read('driveUploadDestination', { target, caller });
  if (found.kind === 'refused') throw new TusError(found.status, found.message);
  return found.destination;
}

export interface OwnedLookup {
  readonly id: string;
  readonly caller: TusCaller;
  readonly now: Date;
}

export async function ownedUpload(
  store: Pick<Store, 'host'>,
  { id, caller, now }: OwnedLookup,
): Promise<DriveUpload> {
  const owner = { profileId: caller.profileId, clientId: caller.clientId, nodeId: caller.nodeId };
  const upload = await store.host.call('driveUploads', 'findOwned', id, owner);
  const due = upload?.state === 'open' && Date.parse(upload.expiresAt) <= now.getTime();
  if (upload === undefined || upload.state === 'failed' || upload.state === 'expired' || due) {
    throw absent();
  }
  return upload;
}

export async function relPathOf(
  env: ChangeEnv,
  destination: Destination,
  name: string,
): Promise<string> {
  if (destination.item !== null) {
    return destination.item.relPath;
  }
  const folder = destination.folder?.relPath ?? '';
  for (let attempt = 1; ; attempt += 1) {
    const candidate = freeNameAt(name, attempt);
    const relPath = folder === '' ? candidate : `${folder}/${candidate}`;
    const indexed = await env.store.host.call(
      'driveItems',
      'byPath',
      destination.root.id,
      relPath,
      null,
    );
    const onDisk = await env.files.stamp(await locate(destination.root, relPath));
    if (indexed === undefined && onDisk === null) {
      return relPath;
    }
  }
}
