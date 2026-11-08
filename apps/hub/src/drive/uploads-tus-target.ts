import type { DriveItem, DriveUploadTarget } from '@smarteverything/domain';
import type { ChangeEnv } from './changes';
import { assertWritable, locate, physicalRoot, type DriveWriteRoot } from './intents';
import { rootVisibleTo, type DriveActor } from './service-read';
import { freeNameAt, TusError } from './uploads-tus-wire';

export interface Destination {
  readonly root: DriveWriteRoot;
  readonly folder: DriveItem | null;
  readonly item: Exclude<DriveItem, { readonly kind: 'folder' }> | null;
}

export function destinationOf(
  store: ChangeEnv['store'],
  target: DriveUploadTarget,
  caller: DriveActor,
): Destination {
  const found = store.driveItems.find(target.kind === 'folder' ? target.folderId : target.itemId);
  const rootRow = found === undefined ? undefined : store.driveRoots.find(found.rootId);
  if (found === undefined || rootRow === undefined || !rootVisibleTo(caller, rootRow)) {
    throw new TusError(404, 'There is no such target for this credential.');
  }
  const root = physicalRoot(rootRow);
  assertWritable(root);
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
    const indexed = env.store.driveItems.byPath(destination.root.id, relPath);
    const onDisk = await env.files.stamp(await locate(destination.root, relPath));
    if (indexed === undefined && onDisk === null) {
      return relPath;
    }
  }
}
