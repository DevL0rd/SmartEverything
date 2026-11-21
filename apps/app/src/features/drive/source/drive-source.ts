import { useQueryClient } from '@tanstack/react-query';
import {
  createDriveShortcut,
  readDriveItem,
  removeDriveShortcut,
  setDriveItemLock,
  setDriveOffline,
  updateDriveShortcut,
} from '../../../api/drive';
import { changeDriveBatched } from '../../../store/drive-bulk';
import { useSession, useSyncStatus } from '../../../store/selectors';
import type { FileSource } from '../../files';
import { router } from 'expo-router';
import { invalidateAllDrive, useDriveChips, useDriveRootPlaces, useViewerId } from '../data';
import type { DriveRootPlace } from '../model/drive-access';
import { shownDriveCreates } from '../data/shown';
import { openHrefOf } from '../recent/recent-model';
import { nativeDriveProvider } from '../phone/provider';
import { driveActionsOf, driveRequests, type DriveActionEnv } from './drive-actions';
import { driveDownloadOf, LIVE_DOWNLOAD, type DriveDownloadEnv } from './drive-download';
import { useDriveListing } from './drive-folder';
import { useDriveInfo, useDriveLinks, useDriveSearchResults, useDriveZip } from './drive-hooks';
import { useDriveAbilities, useDrivePlaces } from './drive-location';
import { openTargetOf, type DriveOrigin } from './drive-node';
import { runDriveOp, type DriveOpsEnv, type DriveShortcutCalls } from './drive-ops';
import type { RestoreEnv } from './drive-restore';
import { driveInfoSectionsOf } from './drive-info';
import { driveTabsOf } from './drive-tabs';
import { LIVE_UPLOAD, driveUploadTransport, type DriveUploadEnv } from './drive-upload';

export const DRIVE_SOURCE_ID = 'drive';

export interface DriveSourceEnv {
  readonly roots: readonly DriveRootPlace[];
  readonly viewerId: string | null;
  readonly clientId: string;
  readonly online: boolean;
  readonly phone: boolean;
  readonly change: DriveOpsEnv['change'];
  readonly setOffline: DriveActionEnv['setOffline'];
  readonly setLock: DriveActionEnv['setLock'];
  readonly removeShortcut: DriveActionEnv['removeShortcut'];
  readonly updateShortcut: DriveShortcutCalls['update'];
  readonly createShortcut: DriveShortcutCalls['create'];
  readonly refresh: () => void;
  readonly restore: RestoreEnv;
  readonly request: DriveActionEnv['request'];
  readonly start: DriveUploadEnv['start'];
  readonly watch: DriveUploadEnv['watch'];
  readonly download: DriveDownloadEnv;
}

export function createDriveSource(env: DriveSourceEnv): FileSource<DriveOrigin> {
  const ops: DriveOpsEnv = {
    change: env.change,
    shortcuts: {
      update: env.updateShortcut,
      remove: env.removeShortcut,
      create: env.createShortcut,
    },
    roots: env.roots,
    viewerId: env.viewerId,
    restore: env.restore,
  };
  return {
    id: DRIVE_SOURCE_ID,
    label: 'Drive',
    useAbilities: useDriveAbilities,
    usePlaces: useDrivePlaces,
    useFolder: useDriveListing,
    useSearch: useDriveSearchResults,
    useLinks: useDriveLinks,
    useZip: useDriveZip,
    useInfo: useDriveInfo,
    infoSections: driveInfoSectionsOf,
    locationOf: () => null,
    openTargetOf,
    run: (op) => runDriveOp(op, ops),
    upload: driveUploadTransport(env),
    download: (nodes) => driveDownloadOf(nodes, env.download),
    actions: (nodes) => driveActionsOf(nodes, env),
    tabs: driveTabsOf,
  };
}

export function useDriveSource(): FileSource<DriveOrigin> {
  const client = useQueryClient();
  const roots = useDriveRootPlaces();
  const chipOf = useDriveChips();
  const viewerId = useViewerId();
  return createDriveSource({
    roots,
    viewerId,
    clientId: useSession().client.id,
    online: useSyncStatus().status === 'live',
    phone: nativeDriveProvider.linked(),
    change: shownDriveCreates(client, viewerId, (body) => changeDriveBatched(body)),
    setOffline: setDriveOffline,
    setLock: setDriveItemLock,
    removeShortcut: removeDriveShortcut,
    updateShortcut: updateDriveShortcut,
    createShortcut: createDriveShortcut,
    refresh: () => {
      invalidateAllDrive(client);
    },
    restore: {
      readItem: (itemId) => readDriveItem(itemId),
      labelOf: (rootId) => chipOf(rootId).label,
      open: (item) => {
        router.push(openHrefOf(item, roots));
      },
    },
    request: (request) => {
      driveRequests.set(request);
    },
    start: LIVE_UPLOAD.start,
    watch: LIVE_UPLOAD.watch,
    download: LIVE_DOWNLOAD,
  });
}
