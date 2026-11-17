import { ApiError, LOCKED_TOKEN_HEADER, PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import type { DriveWriteService } from '../../drive/service-write';
import { directClient, profileIdOf, type Caller } from '../../server/auth';
import { callerOf } from '../../server/handlers/drive-services';
import type { IncomingHttpHeaders } from 'node:http';
import type { MediaLinks } from '../../server/media-links';
import { bound, DONE_REPLY, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import { photoActor } from '../actor';
import { ArchiveService } from './archive';
import { LockedService } from './locked';
import { LockedLinks } from './locked-links';
import { LockedMover } from './locked-move';
import { DescriptionEditor } from './description';
import { MetaEditor } from './meta';
import { OrganisePages } from './pages';

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
  readonly description: DescriptionEditor;
  readonly archive: ArchiveService;
  readonly pages: OrganisePages;
  readonly locked: LockedService;
  readonly mover: LockedMover;
  readonly links: LockedLinks;
}

export interface OrganiseInputs {
  readonly store: Store;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly links: Pick<MediaLinks, 'claimed'>;
  readonly now: () => Date;
  readonly timeZone: () => string;
}

export function organiseServices(inputs: OrganiseInputs): OrganiseServices {
  const { store, now } = inputs;
  return {
    meta: new MetaEditor(store),
    description: new DescriptionEditor(store),
    archive: new ArchiveService(store),
    pages: new OrganisePages(store.context, inputs.timeZone),
    locked: new LockedService({ locked: store.photoLocked, now }),
    mover: new LockedMover({ store, write: inputs.write, now }),
    links: new LockedLinks(store, inputs.links),
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
      services.meta.edit(photoActor(store, caller), body),
    ),
    setPhotoDescription: bound(E.setPhotoDescription, ({ params, body, caller }) =>
      services.description.set(photoActor(store, caller), params.itemId, body),
    ),
    archivePhotos: bound(E.archivePhotos, ({ body, caller }) =>
      services.archive.archive(photoActor(store, caller), body),
    ),
    unarchivePhotos: bound(E.unarchivePhotos, ({ body, caller }) =>
      services.archive.unarchive(photoActor(store, caller), body),
    ),
    readPhotoArchived: bound(E.readPhotoArchived, ({ params, caller }) =>
      services.archive.archived(photoActor(store, caller), params.itemId),
    ),
    readArchiveBuckets: bound(E.readArchiveBuckets, ({ query, caller }) =>
      services.pages.archiveBuckets(photoActor(store, caller), query),
    ),
    readArchivePage: bound(E.readArchivePage, ({ params, query, caller }) =>
      services.pages.archivePage(photoActor(store, caller), params.month, query),
    ),
  };
}

function lockedRoutes(
  store: Store,
  services: OrganiseServices,
): Pick<PhotoOrganiseRoutes, LockedRouteName> {
  const opened = (caller: Caller, headers: IncomingHttpHeaders): string =>
    services.locked.require(profileIdOf(store, caller), appClientOf(caller), tokenOf(headers));
  return {
    readLockedState: bound(E.readLockedState, ({ caller }) =>
      services.locked.state(profileIdOf(store, caller)),
    ),
    setLockedPin: bound(E.setLockedPin, async ({ body, caller }) => {
      appClientOf(caller);
      await services.locked.setPin(profileIdOf(store, caller), body);
      return DONE_REPLY;
    }),
    unlockLockedFolder: bound(E.unlockLockedFolder, ({ body, caller }) =>
      services.locked.unlock(profileIdOf(store, caller), appClientOf(caller), body.pin),
    ),
    lockLockedFolder: bound(E.lockLockedFolder, ({ caller }) => {
      services.locked.lock(profileIdOf(store, caller), appClientOf(caller));
      return DONE_REPLY;
    }),
    readLockedBuckets: bound(E.readLockedBuckets, ({ query, caller, headers }) => {
      opened(caller, headers);
      return services.pages.lockedBuckets(photoActor(store, caller), query);
    }),
    readLockedPage: bound(E.readLockedPage, ({ params, query, caller, headers }) => {
      opened(caller, headers);
      return services.pages.lockedPage(photoActor(store, caller), params.month, query);
    }),
    readLockedLinks: bound(E.readLockedLinks, ({ body, caller, headers }) =>
      services.links.mint(profileIdOf(store, caller), opened(caller, headers), body),
    ),
    moveIntoLockedFolder: bound(E.moveIntoLockedFolder, ({ body, caller }) =>
      services.mover.moveIn(callerOf(store, caller), body),
    ),
    moveOutOfLockedFolder: bound(E.moveOutOfLockedFolder, ({ body, caller, headers }) => {
      opened(caller, headers);
      return services.mover.moveOut(callerOf(store, caller), body);
    }),
    deleteFromLockedFolder: bound(E.deleteFromLockedFolder, ({ body, caller, headers }) => {
      opened(caller, headers);
      return services.mover.remove(callerOf(store, caller), body);
    }),
  };
}

export function photoOrganiseRoutes(store: Store, services: OrganiseServices): PhotoOrganiseRoutes {
  return { ...pageRoutes(store, services), ...lockedRoutes(store, services) };
}
