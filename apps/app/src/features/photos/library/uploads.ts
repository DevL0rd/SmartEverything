import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type { z } from 'zod';
import { api } from '../../../api/transport';
import { ValueStore, usePausable } from '../../../design/external-store';
import type { PickedBlob } from '../../../platform/pick-files';
import { dismissUpload, startUpload, uploadEntries, type UploadHandle } from '../../drive';

const log = new Logger('app.photos');

export type UploadTarget = z.output<typeof PHOTOS_ENDPOINTS.resolvePhotoUploadTarget.response>;

function resolveManualTarget(): Promise<UploadTarget> {
  return api().call(PHOTOS_ENDPOINTS.resolvePhotoUploadTarget, { body: { kind: 'manual' } });
}

export interface UploadDeps {
  readonly resolve: () => Promise<UploadTarget>;
  readonly start: typeof startUpload;
}

const LIVE: UploadDeps = { resolve: resolveManualTarget, start: startUpload };

export const uploadPath = new ValueStore<string | null>(null);

const handles = new Map<string, UploadHandle>();

export function useUploadPath(): string | null {
  return usePausable(uploadPath.subscribe, uploadPath.get);
}

export function identityOf(file: PickedBlob): string {
  return `photos-upload:${file.name}:${String(file.bytes)}`;
}

function track(handle: UploadHandle): void {
  handles.set(handle.id, handle);
  background(
    handle.outcome.then(() => {
      handles.delete(handle.id);
    }),
    'photos.upload.settle_failed',
  );
}

export async function uploadFiles(
  files: readonly PickedBlob[],
  deps: UploadDeps = LIVE,
): Promise<number> {
  if (files.length === 0) return 0;
  const target = await deps.resolve();
  uploadPath.set(target.path);
  for (const file of files) {
    const source = await file.blob();
    track(
      deps.start({
        identity: identityOf(file),
        source,
        name: file.name,
        target: { kind: 'folder', folderId: target.folderId },
      }),
    );
  }
  log.info('photos.upload.started', { files: files.length });
  return files.length;
}

export function pauseUploads(): void {
  for (const handle of handles.values()) background(handle.pause(), 'photos.upload.pause_failed');
}

export function resumeUploads(): void {
  for (const handle of handles.values()) handle.resume();
}

export function clearSettledUploads(): void {
  for (const entry of uploadEntries.get()) {
    if (entry.state === 'settled') dismissUpload(entry.id);
  }
}
