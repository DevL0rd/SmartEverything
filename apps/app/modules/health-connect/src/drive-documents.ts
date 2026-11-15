import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

const CLIENT_ID = z.uuid();
const IDS = z.array(z.uuid());
const COUNT = z.int().nonnegative();

export const DRIVE_OFFLINE_STATUS = z.strictObject({
  usedBytes: COUNT,
  files: COUNT,
  pins: COUNT,
});

export type DriveOfflineStatus = z.infer<typeof DRIVE_OFFLINE_STATUS>;

declare class DriveDocumentsNative extends NativeModule {
  configure(clientId: string): Promise<void>;
  forget(): Promise<void>;
  notifyChanged(rootIds: readonly string[], folderIds: readonly string[]): Promise<void>;
  offlineStatus(): Promise<unknown>;
  offlineSync(): Promise<void>;
  offlineClear(): Promise<void>;
}

type DriveDocumentsName = Exclude<keyof DriveDocumentsNative, keyof NativeModule>;

const documents = requireOptionalNativeModule<DriveDocumentsNative>('DriveDocuments');

function documentsFor(operation: DriveDocumentsName): DriveDocumentsNative {
  if (documents === null || typeof Reflect.get(documents, operation) !== 'function') {
    throw new AppUpdateNeededError(`Files app access (${operation})`);
  }
  return documents;
}

export function driveDocumentsLinked(): boolean {
  return documents !== null && typeof Reflect.get(documents, 'configure') === 'function';
}

export async function configureDriveDocuments(clientId: string): Promise<void> {
  await documentsFor('configure').configure(CLIENT_ID.parse(clientId));
}

export async function forgetDriveDocuments(): Promise<void> {
  await documentsFor('forget').forget();
}

export async function notifyDriveDocumentsChanged(
  rootIds: readonly string[],
  folderIds: readonly string[],
): Promise<void> {
  await documentsFor('notifyChanged').notifyChanged(IDS.parse(rootIds), IDS.parse(folderIds));
}

export async function driveOfflineStatus(): Promise<DriveOfflineStatus> {
  return DRIVE_OFFLINE_STATUS.parse(await documentsFor('offlineStatus').offlineStatus());
}

export async function syncDriveOffline(): Promise<void> {
  await documentsFor('offlineSync').offlineSync();
}

export async function clearDriveOffline(): Promise<void> {
  await documentsFor('offlineClear').offlineClear();
}
