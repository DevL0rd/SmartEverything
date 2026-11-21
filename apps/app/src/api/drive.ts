import {
  API_ENDPOINTS as E,
  type DriveAlbumChange,
  type DriveAlbumCreate,
  type DriveBackupReportInput,
  type DriveAccessAnswer,
  type DriveAccessRequestCreate,
  type DriveChange,
  type DriveCommentAdd,
  type DriveCommentEdit,
  type DriveFileRequestChange,
  type DriveFileRequestCreate,
  type DriveFolderColourSet,
  type DriveGrantSet,
  type DriveLockSet,
  type DriveNotificationsRead,
  type DriveOfflineSet,
  type DriveShortcutChange,
  type DriveShortcutCreate,
  type DriveTransferAnswer,
  type DriveTransferOffer,
  type DriveZipEntryLink,
  type DriveMountSet,
  type DrivePlacementSet,
  type DriveConflictResolve,
  type DriveQuotaSet,
  type DriveRootChange,
  type DriveSettingsUpdate,
  type DriveShareCreate,
  type DriveShareUnlock,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

export type DriveResult<K extends keyof typeof E> = z.output<(typeof E)[K]['response']>;

type Call<K extends keyof typeof E> = Promise<DriveResult<K>>;

export function listDriveRoots(): Call<'listRoots'> {
  return api().call(E.listRoots, {});
}

export function updateDriveRoot(rootId: string, body: DriveRootChange): Call<'updateRoot'> {
  return api().call(E.updateRoot, { params: { rootId }, body });
}

export function scanDriveRoot(rootId: string): Call<'scanRoot'> {
  return api().call(E.scanRoot, { params: { rootId } });
}

export function setDrivePlacement(body: DrivePlacementSet): Call<'setPlacement'> {
  return api().call(E.setPlacement, { body });
}

export function setComputerMount(body: DriveMountSet): Call<'setComputerMount'> {
  return api().call(E.setComputerMount, { body });
}

export function removeDrivePlacement(placementId: string): Call<'removePlacement'> {
  return api().call(E.removePlacement, { params: { placementId } });
}

export function listDriveGrants(itemId: string, signal: AbortSignal): Call<'listGrants'> {
  return api().call(E.listGrants, { params: { itemId } }, { signal });
}

export function setDriveGrant(body: DriveGrantSet): Call<'setGrant'> {
  return api().call(E.setGrant, { body });
}

export function removeDriveGrant(grantId: string): Call<'removeGrant'> {
  return api().call(E.removeGrant, { params: { grantId } });
}

export function readDriveItem(
  itemId: string,
  request: { readonly signal?: AbortSignal } = {},
): Call<'readItem'> {
  return api().call(E.readItem, { params: { itemId } }, request);
}

export function changeDrive(body: DriveChange): Call<'changeDrive'> {
  return api().call(E.changeDrive, { body });
}

export function readDriveStats(signal: AbortSignal): Call<'readDriveStats'> {
  return api().call(E.readDriveStats, {}, { signal });
}

export function createDriveAlbum(body: DriveAlbumCreate): Call<'createAlbum'> {
  return api().call(E.createAlbum, { body });
}

export function updateDriveAlbum(albumId: string, body: DriveAlbumChange): Call<'updateAlbum'> {
  return api().call(E.updateAlbum, { params: { albumId }, body });
}

export function removeDriveAlbum(albumId: string): Call<'removeAlbum'> {
  return api().call(E.removeAlbum, { params: { albumId } });
}

export function restoreDriveVersion(itemId: string, versionId: string): Call<'restoreVersion'> {
  return api().call(E.restoreVersion, { params: { itemId, versionId } });
}

export async function driveVersionFileUrl(itemId: string, versionId: string): Promise<string> {
  const client = api().forMedia();
  const link = await client.call(E.versionLink, { params: { itemId, versionId } });
  return client.resourceUrl(link.url, link.expiresAt, 'attachment');
}

export function createDriveShare(body: DriveShareCreate): Call<'createShare'> {
  return api().call(E.createShare, { body });
}

export function revokeDriveShare(shareId: string): Call<'revokeShare'> {
  return api().call(E.revokeShare, { params: { shareId } });
}

export function unlockDriveShare(token: string, body: DriveShareUnlock): Call<'unlockShare'> {
  return api().call(E.unlockShare, { params: { token }, body });
}

export function readDriveUsage(signal: AbortSignal): Call<'readUsage'> {
  return api().call(E.readUsage, {}, { signal });
}

export function listDriveQuotas(signal: AbortSignal): Call<'listQuotas'> {
  return api().call(E.listQuotas, {}, { signal });
}

export function setDriveQuota(body: DriveQuotaSet): Call<'setQuota'> {
  return api().call(E.setQuota, { body });
}

export function readDriveHealth(signal: AbortSignal): Call<'readHealth'> {
  return api().call(E.readHealth, {}, { signal });
}

export function startDriveScrub(): Call<'startScrub'> {
  return api().call(E.startScrub, {});
}

export function reportDriveBackup(body: DriveBackupReportInput): Call<'reportBackup'> {
  return api().call(E.reportBackup, { body });
}

export function readDriveBackupStatus(signal: AbortSignal): Call<'readBackupStatus'> {
  return api().call(E.readBackupStatus, {}, { signal });
}

export function resolveDriveConflict(body: DriveConflictResolve): Call<'resolveConflict'> {
  return api().call(E.resolveConflict, { body });
}

export function readDriveSettings(signal: AbortSignal): Call<'readDriveSettings'> {
  return api().call(E.readDriveSettings, {}, { signal });
}

export function updateDriveSettings(body: DriveSettingsUpdate): Call<'updateDriveSettings'> {
  return api().call(E.updateDriveSettings, { body });
}

export async function readDriveZipEntryLink(
  itemId: string,
  index: number,
  request: { readonly signal?: AbortSignal } = {},
): Promise<DriveZipEntryLink> {
  const client = api().forMedia();
  const link = await client.call(E.zipEntryLink, { params: { itemId }, query: { index } }, request);
  const present = async (
    target: DriveZipEntryLink['file'],
  ): Promise<DriveZipEntryLink['file']> => ({
    url: await client.resourceUrl(target.url, target.expiresAt, 'attachment'),
    expiresAt: target.expiresAt,
  });
  return {
    index: link.index,
    file: await present(link.file),
    download: link.download === null ? null : await present(link.download),
  };
}

export function readDriveItemText(itemId: string, signal: AbortSignal): Call<'readItemText'> {
  return api().call(E.readItemText, { params: { itemId } }, { signal });
}

export function openDriveItem(itemId: string, signal: AbortSignal): Call<'openItem'> {
  return api().call(E.openItem, { params: { itemId } }, { signal });
}

export function setDriveItemLock(body: DriveLockSet): Call<'setItemLock'> {
  return api().call(E.setItemLock, { body });
}

export function setDriveFolderColour(body: DriveFolderColourSet): Call<'setFolderColour'> {
  return api().call(E.setFolderColour, { body });
}

export function createDriveShortcut(body: DriveShortcutCreate): Call<'createShortcut'> {
  return api().call(E.createShortcut, { body });
}

export function updateDriveShortcut(
  shortcutId: string,
  body: DriveShortcutChange,
): Call<'updateShortcut'> {
  return api().call(E.updateShortcut, { params: { shortcutId }, body });
}

export function removeDriveShortcut(shortcutId: string): Call<'removeShortcut'> {
  return api().call(E.removeShortcut, { params: { shortcutId } });
}

export function addDriveComment(itemId: string, body: DriveCommentAdd): Call<'addComment'> {
  return api().call(E.addComment, { params: { itemId }, body });
}

export function editDriveComment(commentId: string, body: DriveCommentEdit): Call<'editComment'> {
  return api().call(E.editComment, { params: { commentId }, body });
}

export function resolveDriveComment(commentId: string, resolved: boolean): Call<'resolveComment'> {
  return api().call(E.resolveComment, { params: { commentId }, body: { resolved } });
}

export function removeDriveComment(commentId: string): Call<'removeComment'> {
  return api().call(E.removeComment, { params: { commentId } });
}

export function requestDriveAccess(body: DriveAccessRequestCreate): Call<'requestDriveAccess'> {
  return api().call(E.requestDriveAccess, { body });
}

export function answerDriveAccessRequest(
  requestId: string,
  body: DriveAccessAnswer,
): Call<'answerDriveAccessRequest'> {
  return api().call(E.answerDriveAccessRequest, { params: { requestId }, body });
}

export function createDriveFileRequest(body: DriveFileRequestCreate): Call<'createFileRequest'> {
  return api().call(E.createFileRequest, { body });
}

export function updateDriveFileRequest(
  fileRequestId: string,
  body: DriveFileRequestChange,
): Call<'updateFileRequest'> {
  return api().call(E.updateFileRequest, { params: { fileRequestId }, body });
}

export function closeDriveFileRequest(fileRequestId: string): Call<'closeFileRequest'> {
  return api().call(E.closeFileRequest, { params: { fileRequestId } });
}

export function markDriveNotificationsRead(
  body: DriveNotificationsRead,
): Call<'markNotificationsRead'> {
  return api().call(E.markNotificationsRead, { body });
}

export function offerDriveTransfer(body: DriveTransferOffer): Call<'offerTransfer'> {
  return api().call(E.offerTransfer, { body });
}

export function answerDriveTransfer(
  transferId: string,
  body: DriveTransferAnswer,
): Call<'answerTransfer'> {
  return api().call(E.answerTransfer, { params: { transferId }, body });
}

export function cancelDriveTransfer(transferId: string): Call<'cancelTransfer'> {
  return api().call(E.cancelTransfer, { params: { transferId } });
}

export function setDriveOffline(body: DriveOfflineSet): Call<'setOffline'> {
  return api().call(E.setOffline, { body });
}
