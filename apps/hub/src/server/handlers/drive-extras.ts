import type { DriveActivity } from '../../drive/activity';
import { randomUUID } from 'node:crypto';
import { FolderIconRefresher, hostFolderIcons } from '../../drive/content/folder-icon/refresh';
import type { FolderIconServing } from '../../drive/content/folder-icon/icon-route';
import { BUNDLED_CONTENT_WORKER } from '../../drive/content/content-worker-client';
import type { DriveContentDeps } from '../../drive/content/content-reads';
import { hostText, type TextEnvironment } from '../../drive/content/text-job';
import type { ZipEntryServing } from '../../drive/content/zip-entry-route';
import type { ConflictEnv } from '../../drive/conflicts';
import { DriveDownloads } from '../../drive/download-zip';
import { DriveOffline } from '../../drive/offline';
import { loadDriveSettings } from '../../drive/settings';
import { DrivePlacements } from '../../drive/placements';
import type { RootAvailability } from '../../drive/root-marker';
import type { DriveReadService } from '../../drive/service-read';
import { shareOriginOf, type DriveShares, type ShareOrigin } from '../../drive/shares';
import { DriveAccessRequests } from '../../drive/sharing/access-requests';
import { FileRequestIntake } from '../../drive/sharing/file-request-intake';
import { DriveFileRequests } from '../../drive/sharing/file-requests';
import { GrantExpiry } from '../../drive/sharing/grant-expiry';
import { DriveLocks } from '../../drive/sharing/locks';
import { DriveTransfers } from '../../drive/sharing/transfers';
import { DriveComments } from '../../drive/social/comments';
import { DriveEditNotices } from '../../drive/social/edit-notices';
import { DriveFolderColours } from '../../drive/social/folder-colours';
import { DriveInbox } from '../../drive/social/notifications';
import { DriveShortcuts } from '../../drive/social/shortcuts';
import { DriveSuggestions } from '../../drive/social/suggestions';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import type { DriveDeps } from './drive-wiring';
import type { DriveSharingServices } from './drive-sharing';
import type { DriveSocialServices } from './drive-social';

export interface DriveExtras {
  readonly content: DriveContentDeps;
  readonly zipServing: ZipEntryServing;
  readonly iconServing: FolderIconServing;
  readonly icons: FolderIconRefresher;
  readonly sharing: DriveSharingServices;
  readonly intake: FileRequestIntake;
  readonly requests: DriveFileRequests;
  readonly social: DriveSocialServices;
  readonly offline: DriveOffline;
  readonly expiry: GrantExpiry;
  readonly editNotices: DriveEditNotices;
  readonly downloads: DriveDownloads;
}

export function iconsOf(deps: DriveDeps): FolderIconRefresher {
  const { store, layout } = deps;
  return new FolderIconRefresher({
    icons: hostFolderIcons(store),
    feed: store.feed,
    derivedDirectory: (itemId) => layout.cache.derived(itemId),
    log: deps.log.forArea('hub.drive-icons'),
  });
}

export function textOf(
  deps: DriveDeps,
  availability: (root: StoredDrive) => Promise<RootAvailability>,
  icons: FolderIconRefresher,
  activity: DriveActivity,
): TextEnvironment {
  const { store } = deps;
  return {
    ...hostText(store),
    settings: () => loadDriveSettings(store),
    feed: store.feed,
    availability,
    workerScript: deps.contentScript ?? BUNDLED_CONTENT_WORKER,
    icons,
    activity,
    log: deps.log.forArea('hub.drive-text'),
  };
}

export function placementsOf(deps: DriveDeps): DrivePlacements {
  return new DrivePlacements({ store: deps.store, newId: randomUUID });
}

function socialOf(deps: DriveDeps): DriveSocialServices {
  const { store } = deps;
  return {
    comments: new DriveComments({ store }),
    inbox: new DriveInbox(store),
    shortcuts: new DriveShortcuts({ store }),
    suggestions: new DriveSuggestions(store),
    colours: new DriveFolderColours({ store }),
  };
}

interface SharingParts {
  readonly intake: FileRequestIntake;
  readonly requests: DriveFileRequests;
  readonly services: DriveSharingServices;
}

function sharingOf(
  deps: DriveDeps,
  env: ConflictEnv,
  shares: DriveShares,
  placements: DrivePlacements,
): SharingParts {
  const { store } = deps;
  const requests = new DriveFileRequests({
    store,
    origin: (): ShareOrigin => shareOriginOf(store, deps.localUrl()),
    now: deps.now,
  });
  return {
    requests,
    intake: new FileRequestIntake({ env, store, space: deps.probe.space }),
    services: {
      accessRequests: new DriveAccessRequests({ store }),
      fileRequests: requests,
      transfers: new DriveTransfers({ env, store, space: deps.probe.space, placements }),
      locks: new DriveLocks({ store }),
      shares,
    },
  };
}

export interface ExtrasParts {
  readonly env: ConflictEnv;
  readonly read: DriveReadService;
  readonly shares: DriveShares;
  readonly placements: DrivePlacements;
  readonly icons: FolderIconRefresher;
}

export function extrasOf(deps: DriveDeps, parts: ExtrasParts): DriveExtras {
  const { store } = deps;
  const sharing = sharingOf(deps, parts.env, parts.shares, parts.placements);
  return {
    content: { store, links: deps.links },
    zipServing: { store, links: deps.links, now: deps.now },
    iconServing: {
      folder: (itemId) => store.host.call('driveItems', 'find', itemId, null),
      icon: (itemId) => store.host.call('driveFolderIcons', 'find', itemId),
      links: deps.links,
      derivedDirectory: (itemId) => deps.layout.cache.derived(itemId),
      now: deps.now,
    },
    icons: parts.icons,
    sharing: sharing.services,
    intake: sharing.intake,
    requests: sharing.requests,
    social: socialOf(deps),
    offline: new DriveOffline({
      store,
      push: deps.pushCommands,
      log: deps.log.forArea('hub.drive-offline'),
    }),
    expiry: new GrantExpiry({ store, now: deps.now, log: deps.log.forArea('hub.drive') }),
    editNotices: new DriveEditNotices(store, deps.log.forArea('hub.drive')),
    downloads: new DriveDownloads({
      store,
      read: parts.read,
      links: deps.links,
      now: deps.now,
      newId: randomUUID,
    }),
  };
}
