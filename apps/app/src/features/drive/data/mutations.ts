import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  DriveAccessAnswer,
  DriveAccessRequestCreate,
  DriveFileRequestChange,
  DriveFileRequestCreate,
  DriveFolderColourSet,
  DriveGrantSet,
  DriveLockSet,
  DriveNotificationsRead,
  DriveOfflineSet,
  DrivePlacementSet,
  DriveRootChange,
  DriveSettingsUpdate,
  DriveShortcutChange,
  DriveShortcutCreate,
  DriveTransferOffer,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  answerDriveAccessRequest,
  answerDriveTransfer,
  cancelDriveTransfer,
  closeDriveFileRequest,
  createDriveFileRequest,
  createDriveShortcut,
  markDriveNotificationsRead,
  offerDriveTransfer,
  removeDriveComment,
  removeDriveGrant,
  removeDrivePlacement,
  removeDriveShortcut,
  requestDriveAccess,
  resolveDriveComment,
  scanDriveRoot,
  setDriveFolderColour,
  setDriveGrant,
  setDriveItemLock,
  setDriveOffline,
  setDrivePlacement,
  updateDriveFileRequest,
  updateDriveRoot,
  updateDriveSettings,
  updateDriveShortcut,
} from '../../../api/drive';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { invalidateAllDrive } from './live';

const log = new Logger('app.drive');

export interface DriveMutation<Args extends readonly unknown[]> {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly run: (...args: Args) => void;
}

interface DriveMutationCopy {
  readonly label: string;
  readonly failure: string;
  readonly saved?: string;
}

function useDriveMutation<Args extends readonly unknown[]>(
  { label, failure, saved }: DriveMutationCopy,
  perform: (...args: Args) => Promise<unknown>,
  afterwards?: (client: QueryClient) => void,
): DriveMutation<Args> {
  const mutation = useMutationState();
  const client = useQueryClient();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    run: (...args: Args): void => {
      mutation.run(
        async () => {
          await perform(...args);
          afterwards?.(client);
          log.info(label);
          if (saved !== undefined) notify({ message: saved, tone: 'positive' });
        },
        { failure, label, inline: true },
      );
    },
  };
}

export function useGrantSet(): DriveMutation<[body: DriveGrantSet]> {
  return useDriveMutation(
    { label: 'drive.grant.set', failure: 'Sharing was not changed', saved: 'Sharing saved' },
    setDriveGrant,
  );
}

export function useGrantRemove(): DriveMutation<[grantId: string]> {
  return useDriveMutation(
    { label: 'drive.grant.remove', failure: 'Sharing was not stopped', saved: 'Sharing stopped' },
    removeDriveGrant,
  );
}

export function usePlacementSet(): DriveMutation<[body: DrivePlacementSet]> {
  return useDriveMutation(
    { label: 'drive.placement.set', failure: 'The folder was not changed on this computer' },
    setDrivePlacement,
  );
}

export function usePlacementRemove(): DriveMutation<[placementId: string]> {
  return useDriveMutation(
    { label: 'drive.placement.remove', failure: 'The folder was not stopped on this computer' },
    removeDrivePlacement,
  );
}

export function useDriveSettingsUpdate(): DriveMutation<[body: DriveSettingsUpdate]> {
  return useDriveMutation(
    { label: 'drive.settings.update', failure: 'The settings were not saved' },
    updateDriveSettings,
  );
}

export function useDriveRootUpdate(): DriveMutation<[rootId: string, body: DriveRootChange]> {
  return useDriveMutation(
    { label: 'drive.root.update', failure: 'The drive was not changed' },
    updateDriveRoot,
  );
}

export function useDriveRescan(): DriveMutation<[rootId: string]> {
  return useDriveMutation(
    { label: 'drive.root.scan', failure: 'The drive was not rescanned' },
    scanDriveRoot,
  );
}

export function useCommentResolve(): DriveMutation<[commentId: string, resolved: boolean]> {
  return useDriveMutation(
    { label: 'drive.comment.resolve', failure: 'The thread was not changed' },
    resolveDriveComment,
  );
}

export function useCommentRemove(): DriveMutation<[commentId: string]> {
  return useDriveMutation(
    { label: 'drive.comment.remove', failure: 'The comment was not deleted' },
    removeDriveComment,
  );
}

export function useShortcutCreate(): DriveMutation<[body: DriveShortcutCreate]> {
  return useDriveMutation(
    {
      label: 'drive.shortcut.create',
      failure: 'The shortcut was not made',
      saved: 'Shortcut added',
    },
    createDriveShortcut,
    invalidateAllDrive,
  );
}

export function useShortcutUpdate(): DriveMutation<
  [shortcutId: string, body: DriveShortcutChange]
> {
  return useDriveMutation(
    { label: 'drive.shortcut.update', failure: 'The shortcut was not changed' },
    updateDriveShortcut,
    invalidateAllDrive,
  );
}

export function useShortcutRemove(): DriveMutation<[shortcutId: string]> {
  return useDriveMutation(
    {
      label: 'drive.shortcut.remove',
      failure: 'The shortcut was not removed',
      saved: 'Shortcut removed',
    },
    removeDriveShortcut,
    invalidateAllDrive,
  );
}

export function useAccessRequest(): DriveMutation<[body: DriveAccessRequestCreate]> {
  return useDriveMutation(
    {
      label: 'drive.access.request',
      failure: 'The request was not sent',
      saved: 'Request sent',
    },
    requestDriveAccess,
  );
}

export function useAccessAnswer(): DriveMutation<[requestId: string, body: DriveAccessAnswer]> {
  return useDriveMutation(
    { label: 'drive.access.answer', failure: 'The request was not answered' },
    answerDriveAccessRequest,
  );
}

export function useFileRequestCreate(): DriveMutation<[body: DriveFileRequestCreate]> {
  return useDriveMutation(
    { label: 'drive.file_request.create', failure: 'The upload link was not made' },
    createDriveFileRequest,
  );
}

export function useFileRequestUpdate(): DriveMutation<
  [fileRequestId: string, body: DriveFileRequestChange]
> {
  return useDriveMutation(
    { label: 'drive.file_request.update', failure: 'The file request was not changed' },
    updateDriveFileRequest,
  );
}

export function useFileRequestClose(): DriveMutation<[fileRequestId: string]> {
  return useDriveMutation(
    {
      label: 'drive.file_request.close',
      failure: 'The file request was not closed',
      saved: 'File request closed',
    },
    closeDriveFileRequest,
  );
}

export function useItemLockSet(): DriveMutation<[body: DriveLockSet]> {
  return useDriveMutation(
    { label: 'drive.lock.set', failure: 'View only was not changed' },
    setDriveItemLock,
    invalidateAllDrive,
  );
}

export function useFolderColourSet(): DriveMutation<[body: DriveFolderColourSet]> {
  return useDriveMutation(
    { label: 'drive.colour.set', failure: 'The folder colour was not changed' },
    setDriveFolderColour,
    invalidateAllDrive,
  );
}

export function useNotificationsRead(): DriveMutation<[body: DriveNotificationsRead]> {
  return useDriveMutation(
    { label: 'drive.notifications.read', failure: 'The notifications were not marked as read' },
    markDriveNotificationsRead,
  );
}

export function useTransferOffer(): DriveMutation<[body: DriveTransferOffer]> {
  return useDriveMutation(
    {
      label: 'drive.transfer.offer',
      failure: 'The ownership offer was not sent',
      saved: 'Ownership offered',
    },
    offerDriveTransfer,
  );
}

export function useTransferAnswer(): DriveMutation<[transferId: string, accept: boolean]> {
  return useDriveMutation(
    { label: 'drive.transfer.answer', failure: 'The ownership offer was not answered' },
    (transferId: string, accept: boolean) => answerDriveTransfer(transferId, { accept }),
    invalidateAllDrive,
  );
}

export function useTransferCancel(): DriveMutation<[transferId: string]> {
  return useDriveMutation(
    {
      label: 'drive.transfer.cancel',
      failure: 'The ownership offer was not taken back',
      saved: 'Offer taken back',
    },
    cancelDriveTransfer,
  );
}

export function useOfflineSet(): DriveMutation<[body: DriveOfflineSet]> {
  return useDriveMutation(
    { label: 'drive.offline.set', failure: 'Offline availability was not changed' },
    setDriveOffline,
  );
}
