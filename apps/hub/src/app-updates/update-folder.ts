import {
  APP_UPDATE_BROADCAST_INDEX_FILE,
  APP_UPDATE_FILE,
  APP_UPDATE_INDEX,
  APP_UPDATE_TARGETED_INDEX_FILE,
  ApiError,
  type AppUpdateEntry,
  type AppUpdateFile,
} from '@smarteverything/domain';
import { join } from 'node:path';
import type { HubLayout } from '../data-layout';
import { AppUpdateIndexInvalidError, Loaded, readIndexFile, verifyStoredFile } from './index-file';

const BLOB_FOLDER = 'blobs';

export interface AppUpdateBlob {
  readonly path: string;
  readonly size: number;
  readonly contentType: string;
}

function referencedFile(
  entries: readonly AppUpdateEntry[],
  sha256: string,
): AppUpdateFile | undefined {
  for (const entry of entries) {
    const files = entry.launch === null ? entry.files : [entry.launch, ...entry.files];
    const found = files.find((file) => file.sha256 === sha256);
    if (found !== undefined) return found;
  }
  return undefined;
}

export class AppUpdateFolder {
  readonly directory: string;
  readonly indexFile: string;
  readonly targetedIndexFile: string;
  private readonly blobs: string;
  private readonly loaded: Loaded<readonly AppUpdateEntry[]>;

  constructor(layout: HubLayout) {
    this.directory = layout.system.updates.appUpdates;
    this.indexFile = join(this.directory, APP_UPDATE_BROADCAST_INDEX_FILE);
    this.targetedIndexFile = join(this.directory, APP_UPDATE_TARGETED_INDEX_FILE);
    this.blobs = join(this.directory, BLOB_FOLDER);
    this.loaded = new Loaded(() => this.readAll());
  }

  entries(): Promise<readonly AppUpdateEntry[]> {
    return this.loaded.get();
  }

  refresh(): Promise<readonly AppUpdateEntry[]> {
    return this.loaded.refresh();
  }

  private async readAll(): Promise<readonly AppUpdateEntry[]> {
    const [broadcast, targeted] = await Promise.all([
      this.readEntries(this.indexFile, false),
      this.readEntries(this.targetedIndexFile, true),
    ]);
    return [...broadcast, ...targeted];
  }

  private async readEntries(file: string, targeted: boolean): Promise<readonly AppUpdateEntry[]> {
    const index = await readIndexFile(file, APP_UPDATE_INDEX, 'an index of app update entries');
    if (index === null) return [];
    if (index.entries.some((entry) => (entry.clientId !== undefined) !== targeted)) {
      throw new AppUpdateIndexInvalidError(file, 'the matching device audience', 'mixed audiences');
    }
    return index.entries;
  }

  blobPath(sha256: string): string {
    const hash = APP_UPDATE_FILE.shape.sha256.safeParse(sha256);
    if (!hash.success) {
      throw new ApiError(
        'invalid_request',
        'An app update file is named by 64 lowercase hexadecimal characters.',
        `received ${String(sha256.length)} characters`,
      );
    }
    return join(this.blobs, hash.data);
  }

  async blobFor(sha256: string): Promise<AppUpdateBlob> {
    const path = this.blobPath(sha256);
    const file = referencedFile(await this.entries(), sha256);
    if (file === undefined) {
      throw new ApiError('not_found', 'No stored app update has that file.');
    }
    await verifyStoredFile(
      path,
      `the ${String(file.size)} byte file the index names as ${file.path}`,
      file.size,
    );
    return { path, size: file.size, contentType: file.contentType };
  }
}
