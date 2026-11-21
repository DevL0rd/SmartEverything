import type { DriveItem, DriveUploadTarget } from '@smarteverything/domain';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { canRead, canWrite, driveAccess, itemAccess, type DriveActor } from '../access';
import { isFileItem } from '../file-item';
import type { Destination } from '../uploads-tus-target';

type DestinationStore = Pick<Store, 'driveRoots' | 'driveItems' | 'driveGrants'>;

class UploadRefusal extends Error {
  override readonly name = 'UploadRefusal';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DestinationInput {
  readonly target: DriveUploadTarget;
  readonly caller: DriveActor;
}

export type FoundDestination =
  | { readonly kind: 'found'; readonly destination: Destination }
  | { readonly kind: 'refused'; readonly status: number; readonly message: string };

const NO_TARGET = 'There is no such target for this credential.';

const VIEW_ONLY = 'This target can only be viewed; nothing can be uploaded into it.';

function writableTop(store: DestinationStore, rootId: string, caller: DriveActor): Destination {
  const root = store.driveRoots.find(rootId);
  if (root === undefined) {
    throw new UploadRefusal(404, NO_TARGET);
  }
  const access = driveAccess(caller, root);
  if (!canRead(access)) {
    throw new UploadRefusal(404, NO_TARGET);
  }
  if (!canWrite(access)) {
    throw new UploadRefusal(403, VIEW_ONLY);
  }
  return { root, folder: null, item: null };
}

type InsideTarget = Exclude<DriveUploadTarget, { readonly kind: 'drive' }>;

function writable(
  store: DestinationStore,
  target: InsideTarget,
  caller: DriveActor,
): { readonly root: StoredDrive; readonly found: DriveItem } {
  const found = store.driveItems.find(
    target.kind === 'folder' ? target.folderId : target.itemId,
    caller.profileId,
  );
  const root = found === undefined ? undefined : store.driveRoots.find(found.rootId);
  if (found === undefined || root === undefined) {
    throw new UploadRefusal(404, NO_TARGET);
  }
  const access = itemAccess(store, caller, root, found);
  if (!canRead(access)) {
    throw new UploadRefusal(404, NO_TARGET);
  }
  if (!canWrite(access)) {
    throw new UploadRefusal(403, VIEW_ONLY);
  }
  return { root, found };
}

function placedDestination(
  store: DestinationStore,
  target: DriveUploadTarget,
  caller: DriveActor,
): Destination {
  if (target.kind === 'drive') {
    return writableTop(store, target.rootId, caller);
  }
  const { root, found } = writable(store, target, caller);
  if (target.kind === 'folder') {
    if (found.kind !== 'folder') {
      throw new UploadRefusal(400, 'The target is not a folder.');
    }
    return { root, folder: found, item: null };
  }
  if (!isFileItem(found)) {
    throw new UploadRefusal(400, 'The target is not a regular file.');
  }
  if (found.rev !== target.baseRev) {
    throw new UploadRefusal(
      409,
      `The file is at rev ${String(found.rev)}, not ${String(target.baseRev)}.`,
    );
  }
  return { root, folder: null, item: found };
}

export function uploadDestination(
  store: DestinationStore,
  input: DestinationInput,
): FoundDestination {
  try {
    return { kind: 'found', destination: placedDestination(store, input.target, input.caller) };
  } catch (cause) {
    if (!(cause instanceof UploadRefusal)) throw cause;
    return { kind: 'refused', status: cause.status, message: cause.message };
  }
}

export const DRIVE_UPLOAD_DESTINATION_UNIT = storeUnit((store, input: DestinationInput) =>
  uploadDestination(store, input),
);
