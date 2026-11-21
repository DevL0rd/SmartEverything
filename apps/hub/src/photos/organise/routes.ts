import { ApiError, LOCKED_TOKEN_HEADER, PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import type { DriveWriteService } from '../../drive/service-write';
import { directClient, profileIdOf, type Caller } from '../../server/auth';
import { callerOf } from '../../server/handlers/drive-services';
import type { IncomingHttpHeaders } from 'node:http';
import type { MediaLinks } from '../../server/media-links';
import { bound, DONE_REPLY, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import { photoActor } from '../actor';
import { LockedService } from './locked';
import { LockedLinks } from './locked-links';
import { LockedMover } from './locked-move';
import { MetaEditor } from './meta';

const E = PHOTOS_ENDPOINTS;

type RouteName =
  | 'editPhotoMeta'
  | 'setPhotoDescription'
  | 'archivePhotos'
  | 'unarchivePhotos'
  | 'readPhotoArchived'
  | 'readArchiveBuckets'
  | 'readArchivePage'
  | 'readLockedState'
  | 'setLockedPin'
  | 'unlockLockedFolder'
  | 'lockLockedFolder'
  | 'readLockedBuckets'
  | 'readLockedPage'
  | 'readLockedLinks'
  | 'moveIntoLockedFolder'
  | 'moveOutOfLockedFolder'
  | 'deleteFromLockedFolder';

export type PhotoOrganiseRoutes = { readonly [N in RouteName]: Bound<(typeof E)[N]> };

export interface OrganiseServices {
  readonly meta: MetaEditor;
  readonly locked: LockedService;
  readonly mover: LockedMover;
  readonly links: LockedLinks;
}

export interface OrganiseInputs {
  readonly store: Store;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly links: Pick<MediaLinks, 'claimed'>;
  readonly now: () => Date;
}

export function organiseServices(inputs: OrganiseInputs): OrganiseServices {
  const { store, now } = inputs;
  return {
    meta: new MetaEditor(store.host, false),
    locked: new LockedService({ locked: store.photoLocked, now }),
    mover: new LockedMover({ store, write: inputs.write, now }),
    links: new LockedLinks(store.host, inputs.links),
  };
}

function appClientOf(caller: Caller): string {
  const client = directClient(caller);
  if (client === undefined) {
    throw new ApiError('forbidden', 'Only the app opens the Locked folder, never the AI.');
  }
  return client.id;
}

function tokenOf(headers: IncomingHttpHeaders): string | undefined {
  const value = headers[LOCKED_TOKEN_HEADER];
  return typeof value === 'string' ? value : undefined;
}

type PageRouteName =
  | 'editPhotoMeta'
  | 'setPhotoDescription'
  | 'archivePhotos'
  | 'unarchivePhotos'
  | 'readPhotoArchived'
  | 'readArchiveBuckets'
  | 'readArchivePage';

type LockedRouteName = Exclude<RouteName, PageRouteName>;

function pageRoutes(
  store: Store,
  services: OrganiseServices,
): Pick<PhotoOrganiseRoutes, PageRouteName> {
  return {
    editPhotoMeta: bound(E.editPhotoMeta, ({ body, caller }) =>
      services.meta.edit(photoActor(caller), body),
    ),
    setPhotoDescription: bound(E.setPhotoDescription, ({ params, body, caller }) =>
      store.host.write('photoDescription', {
        actor: photoActor(caller),
        itemId: params.itemId,
        change: body,
      }),
    ),
    archivePhotos: bound(E.archivePhotos, ({ body, caller }) =>
      store.host.write('photoArchive', { actor: photoActor(caller), request: body }),
    ),
    unarchivePhotos: bound(E.unarchivePhotos, ({ body, caller }) =>
      store.host.write('photoUnarchive', { actor: photoActor(caller), request: body }),
    ),
    readPhotoArchived: bound(E.readPhotoArchived, ({ params, caller }) =>
      store.host.read('photoArchived', { actor: photoActor(caller), itemId: params.itemId }),
    ),
    readArchiveBuckets: bound(E.readArchiveBuckets, ({ query, caller }) =>
      store.host.read('photoArchiveBuckets', { actor: photoActor(caller), scope: query }),
    ),
    readArchivePage: bound(E.readArchivePage, ({ params, query, caller }) =>
      store.host.read('photoArchivePage', {
        actor: photoActor(caller),
        month: params.month,
        query,
      }),
    ),
  };
}

type Opened = (caller: Caller, headers: IncomingHttpHeaders) => string;

function lockedPageRoutes(
  store: Store,
  opened: Opened,
): Pick<PhotoOrganiseRoutes, 'readLockedBuckets' | 'readLockedPage'> {
  return {
    readLockedBuckets: bound(E.readLockedBuckets, ({ query, caller, headers }) => {
      opened(caller, headers);
      return store.host.read('photoLockedBuckets', {
        actor: photoActor(caller),
        scope: query,
      });
    }),
    readLockedPage: bound(E.readLockedPage, ({ params, query, caller, headers }) => {
      opened(caller, headers);
      return store.host.read('photoLockedPage', {
        actor: photoActor(caller),
        month: params.month,
        query,
      });
    }),
  };
}

function lockedRoutes(
  store: Store,
  services: OrganiseServices,
): Pick<PhotoOrganiseRoutes, LockedRouteName> {
  const opened: Opened = (caller, headers) =>
    services.locked.require(profileIdOf(caller), appClientOf(caller), tokenOf(headers));
  return {
    readLockedState: bound(E.readLockedState, ({ caller }) =>
      services.locked.state(profileIdOf(caller)),
    ),
    setLockedPin: bound(E.setLockedPin, async ({ body, caller }) => {
      appClientOf(caller);
      await services.locked.setPin(profileIdOf(caller), body);
      return DONE_REPLY;
    }),
    unlockLockedFolder: bound(E.unlockLockedFolder, ({ body, caller }) =>
      services.locked.unlock(profileIdOf(caller), appClientOf(caller), body.pin),
    ),
    lockLockedFolder: bound(E.lockLockedFolder, ({ caller }) => {
      services.locked.lock(profileIdOf(caller), appClientOf(caller));
      return DONE_REPLY;
    }),
    ...lockedPageRoutes(store, opened),
    readLockedLinks: bound(E.readLockedLinks, ({ body, caller, headers }) =>
      services.links.mint(profileIdOf(caller), opened(caller, headers), body),
    ),
    moveIntoLockedFolder: bound(E.moveIntoLockedFolder, ({ body, caller }) =>
      services.mover.moveIn(callerOf(caller), body),
    ),
    moveOutOfLockedFolder: bound(E.moveOutOfLockedFolder, ({ body, caller, headers }) => {
      opened(caller, headers);
      return services.mover.moveOut(callerOf(caller), body);
    }),
    deleteFromLockedFolder: bound(E.deleteFromLockedFolder, ({ body, caller, headers }) => {
      opened(caller, headers);
      return services.mover.remove(callerOf(caller), body);
    }),
  };
}

export function photoOrganiseRoutes(store: Store, services: OrganiseServices): PhotoOrganiseRoutes {
  return { ...pageRoutes(store, services), ...lockedRoutes(store, services) };
}
