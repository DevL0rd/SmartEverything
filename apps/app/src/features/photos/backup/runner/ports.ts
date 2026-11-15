import type {
  BackupCheck,
  BackupHave,
  BackupHaveResult,
  BackupRegister,
  PhotosBackupPref,
} from '@smarteverything/domain';
import type { UploadHandle } from '../../../drive';
import type {
  BackupDeviceIdentity,
  Conditions,
  MediaAccess,
  MediaRow,
  MediaScope,
  MediaStat,
} from '../model/types';

export interface MediaLibraryPort {
  access(): Promise<MediaAccess>;
  requestAccess(): Promise<MediaAccess>;
  presentPicker(): Promise<void>;
  listIds(scope: MediaScope, signal?: AbortSignal): Promise<ReadonlySet<string>>;
  pagesFrom(
    scope: MediaScope,
    modifiedFrom: number,
    signal?: AbortSignal,
  ): AsyncIterable<readonly MediaRow[]>;
  modificationTimes(
    localIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, number>>;
  onChange(listener: () => void): () => void;
  remove(localIds: readonly string[]): Promise<boolean>;
}

export interface NativeMediaPort {
  statMedia(localIds: readonly string[], signal?: AbortSignal): Promise<readonly MediaStat[]>;
  hashFile(
    uri: string,
    signal?: AbortSignal,
  ): Promise<{ readonly sha256: string; readonly bytes: number }>;
}

export interface ConditionsPort {
  read(): Promise<Conditions>;
  subscribe(listener: () => void): () => void;
}

export interface BackupUploadRequest {
  readonly identity: string;
  readonly uri: string;
  readonly bytes: number;
  readonly name: string;
  readonly mimeType: string;
  readonly folderId: string;
  readonly sha256: string;
}

export interface UploadPort {
  start(request: BackupUploadRequest): UploadHandle;
}

export interface BackupHubPort {
  register(input: BackupRegister): Promise<unknown>;
  lookupHashes(input: BackupHave): Promise<BackupHaveResult>;
  checkBackup(input: BackupCheck): Promise<BackupHaveResult>;
  resolveTarget(deviceId: string, takenAt: string): Promise<{ readonly folderId: string }>;
}

export interface SettingsPort {
  read(): PhotosBackupPref;
  subscribe(listener: () => void): () => void;
}

export interface LedgerStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface LedgerFile {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export interface LedgerStores {
  readonly storage: LedgerStorage;
  readonly ledgerFile: LedgerFile;
}

export interface BackupPorts {
  readonly media: MediaLibraryPort;
  readonly native: NativeMediaPort;
  readonly conditions: ConditionsPort;
  readonly upload: UploadPort;
  readonly hub: BackupHubPort;
  readonly settings: SettingsPort;
  readonly storage: LedgerStorage;
  readonly ledgerFile: LedgerFile;
  readonly identity: BackupDeviceIdentity;
  readonly available: () => boolean;
  readonly now: () => Date;
}
