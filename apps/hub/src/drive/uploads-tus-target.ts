import type { DriveItem, DriveUploadTarget } from '@smarteverything/domain';
import type { ChangeEnv } from './changes';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { canRead, canWrite, itemAccess, type DriveActor } from './access';
import { locate, type DriveWriteRoot } from './intents';
import { freeNameAt, TusError } from './uploads-tus-wire';

export interface Destination {
  readonly root: DriveWriteRoot;
  readonly folder: DriveItem | null;
  readonly item: Exclude<DriveItem, { readonly kind: 'folder' }> | null;
}

function writable(
  store: ChangeEnv['store'],
  target: DriveUploadTarget,
  caller: DriveActor,
): { readonly root: StoredDrive; readonly found: DriveItem } {
  const found = store.driveItems.find(
    target.kind === 'folder' ? target.folderId : target.itemId,
    caller.profileId,
  );
  const root = found === undefined ? undefined : store.driveRoots.find(found.rootId);
  if (found === undefined || root === undefined) {
    throw new TusError(404, 'There is no such target for this credential.');
  }
  const access = itemAccess(store, caller, root, found);
  if (!canRead(access)) {
    throw new TusError(404, 'There is no such target for this credential.');
  }
  if (!canWrite(access)) {
    throw new TusError(403, 'This target can only be viewed; nothing can be uploaded into it.');
  }
  return { root, found };
}

export function destinationOf(
  store: ChangeEnv['store'],
  target: DriveUploadTarget,
  caller: DriveActor,
): Destination {
  const { root, found } = writable(store, target, caller);
  if (target.kind === 'folder') {
    if (found.kind !== 'folder') {
      throw new TusError(400, 'The target is not a folder.');
    }
    return { root, folder: found, item: null };
  }
  if (found.kind === 'folder') {
    throw new TusError(400, 'The target is a folder, not a file.');
  }
  if (found.rev !== target.baseRev) {
    throw new TusError(
      409,
      `The file is at rev ${String(found.rev)}, not ${String(target.baseRev)}.`,
    );
  }
  return { root, folder: null, item: found };
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
    const indexed = env.store.driveItems.byPath(destination.root.id, relPath, null);
    const onDisk = await env.files.stamp(await locate(destination.root, relPath));
    if (indexed === undefined && onDisk === null) {
      return relPath;
    }
  }
}
