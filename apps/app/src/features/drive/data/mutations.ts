import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  DriveAccessAnswer,
  DriveAccessRequestCreate,
  DriveFolderColourSet,
  DriveGrantSet,
  DriveLockSet,
  DriveNotificationsRead,
  DriveOfflineSet,
  DriveRootChange,
  DriveSettingsUpdate,
  DriveShortcutChange,
  DriveShortcutCreate,
  DriveTransferOffer,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import {
  answerDriveAccessRequest,
  answerDriveTransfer,
  cancelDriveTransfer,
  closeDriveFileRequest,
  createDriveShortcut,
  markDriveNotificationsRead,
  offerDriveTransfer,
  removeDriveGrant,
  removeDriveShortcut,
  requestDriveAccess,
  scanDriveRoot,
  setDriveFolderColour,
  setDriveGrant,
  setDriveItemLock,
  setDriveOffline,
  updateDriveRoot,
  updateDriveSettings,
  updateDriveShortcut,
} from '../../../api/drive';
import { notify } from '../../../components/toast-store';
import type { EntityStore } from '../../../store/entity-store';
import { useMutationState } from '../../../store/mutation';
import { writeOptimistically } from '../../../store/optimistic';
import type { StoreState } from '../../../store/state';
import { useEntityStore } from '../../../store/store-context';
import { invalidateAllDrive } from './live';
import {
  accessAnswerShown,
  accessRequestShown,
  fileRequestCloseShown,
  grantRemoveShown,
  grantSetShown,
  notificationsReadShown,
  transferAnswerShown,
  transferCancelShown,
  transferOfferShown,
  type DriveShown,
  type OfferedItem,
  type SentAccessRequest,
  type WithClientId,
} from './row-shown';

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

type Shown<Args extends readonly unknown[], R> = (
  state: StoreState,
  now: string,
  ...args: Args
) => DriveShown<R>;

async function sendShown<R>(
  store: EntityStore,
  label: string,
  shown: DriveShown<R>,
  send: () => Promise<R>,
): Promise<void> {
  const answer = await writeOptimistically(store, { event: label, edits: shown.edits, send });
  const { settle } = shown;
  if (settle !== null) store.update((state) => settle(state, answer));
}

function useShownDriveMutation<Args extends readonly unknown[], R>(
  { label, failure, saved }: DriveMutationCopy,
  perform: (...args: Args) => Promise<R>,
  shown: Shown<Args, R>,
  afterwards?: (client: QueryClient) => void,
): DriveMutation<Args> {
  const mutation = useMutationState();
  const client = useQueryClient();
  const store = useEntityStore();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    run: (...args: Args): void => {
      const edits = shown(store.get(), new Date().toISOString(), ...args);
      mutation.run(
        async () => {
          await sendShown(store, label, edits, () => perform(...args));
          afterwards?.(client);
          if (saved !== undefined) notify({ message: saved, tone: 'positive' });
        },
        { failure, label },
      );
    },
  };
}

function withClientId<B>(
  mutation: DriveMutation<[body: WithClientId<B>]>,
): DriveMutation<[body: B]> {
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    run: (body): void => {
      mutation.run({ ...body, id: randomUUID() });
    },
  };
}

export function useGrantSet(): DriveMutation<[body: DriveGrantSet]> {
  return withClientId(
    useShownDriveMutation(
      { label: 'drive.grant.set', failure: 'Sharing was not changed', saved: 'Sharing saved' },
      setDriveGrant,
      (state, now, body: WithClientId<DriveGrantSet>) => grantSetShown(state, body, now),
    ),
  );
}

export function useGrantRemove(): DriveMutation<[grantId: string]> {
  return useShownDriveMutation(
    { label: 'drive.grant.remove', failure: 'Sharing was not stopped', saved: 'Sharing stopped' },
    removeDriveGrant,
    (state, _now, grantId) => grantRemoveShown(state, grantId),
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

export interface AccessAsk extends DriveMutation<[body: DriveAccessRequestCreate]> {
  readonly sent: SentAccessRequest | null;
}

export function useAccessRequest(): AccessAsk {
  const mutation = useMutationState();
  const [sent, setSent] = useState<SentAccessRequest | null>(null);
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    sent,
    run: (request): void => {
      const body = { ...request, id: randomUUID() };
      setSent(accessRequestShown(body, new Date().toISOString()));
      mutation.run(() => requestDriveAccess(body), {
        failure: 'The request was not sent',
        label: 'drive.access.request',
        inline: true,
        onDone: (saved) => {
          setSent(saved);
          log.info('drive.access.request', { requestId: saved.id });
          notify({ message: 'Request sent', tone: 'positive' });
        },
        onError: () => {
          setSent(null);
        },
      });
    },
  };
}

export function useAccessAnswer(): DriveMutation<[requestId: string, body: DriveAccessAnswer]> {
  return useShownDriveMutation(
    { label: 'drive.access.answer', failure: 'The request was not answered' },
    answerDriveAccessRequest,
    (state, now, requestId, answer) => accessAnswerShown(state, requestId, answer, now),
  );
}

export function useFileRequestClose(): DriveMutation<[fileRequestId: string]> {
  return useShownDriveMutation(
    {
      label: 'drive.file_request.close',
      failure: 'The file request was not closed',
      saved: 'File request closed',
    },
    closeDriveFileRequest,
    (state, now, requestId) => fileRequestCloseShown(state, requestId, now),
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
  return useShownDriveMutation(
    { label: 'drive.notifications.read', failure: 'The notifications were not marked as read' },
    markDriveNotificationsRead,
    (state, now, body) => notificationsReadShown(state, body, now),
  );
}

export function useTransferOffer(item: OfferedItem): DriveMutation<[body: DriveTransferOffer]> {
  return withClientId(
    useShownDriveMutation(
      {
        label: 'drive.transfer.offer',
        failure: 'The ownership offer was not sent',
        saved: 'Ownership offered',
      },
      offerDriveTransfer,
      (state, now, body: WithClientId<DriveTransferOffer>) =>
        transferOfferShown(state, item, body, now),
    ),
  );
}

export function useTransferAnswer(): DriveMutation<[transferId: string, accept: boolean]> {
  return useShownDriveMutation(
    { label: 'drive.transfer.answer', failure: 'The ownership offer was not answered' },
    (transferId: string, accept: boolean) => answerDriveTransfer(transferId, { accept }),
    (state, now, transferId, accept) => transferAnswerShown(state, transferId, accept, now),
    invalidateAllDrive,
  );
}

export function useTransferCancel(): DriveMutation<[transferId: string]> {
  return useShownDriveMutation(
    {
      label: 'drive.transfer.cancel',
      failure: 'The ownership offer was not taken back',
      saved: 'Offer taken back',
    },
    cancelDriveTransfer,
    (state, now, transferId) => transferCancelShown(state, transferId, now),
  );
}

export function useOfflineSet(): DriveMutation<[body: DriveOfflineSet]> {
  return useDriveMutation(
    { label: 'drive.offline.set', failure: 'Offline availability was not changed' },
    setDriveOffline,
  );
}
