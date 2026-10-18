import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { ASSISTANT_ATTACHMENT_BYTES_MAX } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  finishAssistantUpload,
  sendAssistantUploadChunk,
  startAssistantUpload,
} from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { bytes } from '../../../format/number';
import type { PickedFile } from '../../../platform/pick-files';
import {
  DEFAULT_DRAFT_KEY,
  aiDrafts,
  patchAiDrafts,
  useAiDrafts,
  type Upload,
  type UploadFailure,
} from './ai-drafts';

const log = new Logger('app.assistant');

export type { Upload };

export class UploadTooLargeError extends Error {
  override readonly name = 'UploadTooLargeError';

  constructor(
    readonly fileName: string,
    readonly size: number,
  ) {
    super(`${fileName} is ${bytes(size)}; the limit is ${bytes(ASSISTANT_ATTACHMENT_BYTES_MAX)}.`);
  }
}

const RETRYABLE_FAILURE: UploadFailure = { text: 'Failed', retryable: true };

function tooLarge(size: number): UploadFailure {
  return {
    text: `Too large · ${bytes(size)} of ${bytes(ASSISTANT_ATTACHMENT_BYTES_MAX)}`,
    retryable: false,
  };
}

const uploadFiles = new Map<string, PickedFile>();
const commandFiles = new Map<string, PickedFile>();

export function useUploads(draftKey?: string): readonly Upload[] {
  const all = useAiDrafts((state) => state.uploads);
  return useMemo(
    () => (draftKey === undefined ? all : all.filter((item) => item.draftKey === draftKey)),
    [all, draftKey],
  );
}

function patch(key: string, change: Partial<Upload>): void {
  patchAiDrafts('uploads', (list) =>
    list.map((item) => (item.key === key ? { ...item, ...change } : item)),
  );
}

export function removeUpload(key: string): void {
  uploadFiles.delete(key);
  commandFiles.delete(key);
  patchAiDrafts('uploads', (list) => list.filter((item) => item.key !== key));
}

export function clearUploads(draftKey?: string): void {
  const inScope = (item: Upload): boolean => draftKey === undefined || item.draftKey === draftKey;
  aiDrafts
    .get()
    .uploads.filter(inScope)
    .forEach((item) => {
      uploadFiles.delete(item.key);
      commandFiles.delete(item.key);
    });
  patchAiDrafts('uploads', (list) => list.filter((item) => !inScope(item)));
}

export function moveUploads(from: string, to: string): void {
  patchAiDrafts('uploads', (list) =>
    list.map((item) => (item.draftKey === from ? { ...item, draftKey: to } : item)),
  );
}

function base64Of(buffer: ArrayBuffer, start: number, end: number): string {
  const view = new Uint8Array(buffer, start, end - start);
  let binary = '';
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function send(key: string, file: PickedFile): Promise<void> {
  const data = await file.data();
  if (uploadFiles.get(key) !== file) return;
  if (data.byteLength > ASSISTANT_ATTACHMENT_BYTES_MAX) {
    throw new UploadTooLargeError(file.name, data.byteLength);
  }
  const upload = await startAssistantUpload({
    name: file.name,
    mime: file.mime,
    bytes: data.byteLength,
  });
  const chunks = Math.ceil(data.byteLength / upload.chunkBytes);
  for (let index = 0; index < chunks; index += 1) {
    if (uploadFiles.get(key) !== file) return;
    const start = index * upload.chunkBytes;
    const end = Math.min(data.byteLength, start + upload.chunkBytes);
    await sendAssistantUploadChunk(upload.uploadId, index, base64Of(data, start, end));
    patch(key, { progress: end / data.byteLength });
  }
  if (uploadFiles.get(key) !== file) return;
  const attachment = await finishAssistantUpload(upload.uploadId);
  if (uploadFiles.get(key) !== file) return;
  uploadFiles.delete(key);
  patch(key, { state: 'done', progress: 1, attachment });
}

function runUpload(key: string, file: PickedFile): void {
  void send(key, file).catch((error: unknown) => {
    if (uploadFiles.get(key) !== file) return;
    if (error instanceof UploadTooLargeError) {
      patch(key, { state: 'failed', failure: tooLarge(error.size) });
      return;
    }
    log.warn('upload.failed', { reason: String(error) });
    patch(key, { state: 'failed', failure: RETRYABLE_FAILURE });
    notify({ message: `${file.name} couldn’t be attached`, error, tone: 'critical' });
  });
}

export function retryUpload(key: string): void {
  const source = uploadFiles.get(key);
  const upload = aiDrafts.get().uploads.find((item) => item.key === key);
  if (source === undefined || upload?.state !== 'failed') return;
  patch(key, { state: 'uploading', progress: 0, attachment: null, failure: null });
  runUpload(key, source);
}

function enqueue(file: PickedFile, draftKey: string): void {
  const key = randomUUID();
  const oversized = file.bytes > ASSISTANT_ATTACHMENT_BYTES_MAX;
  if (!oversized) {
    uploadFiles.set(key, file);
    commandFiles.set(key, file);
  }
  patchAiDrafts('uploads', (list) => [
    ...list,
    {
      key,
      draftKey,
      name: file.name,
      mime: file.mime,
      preview: file.preview,
      progress: 0,
      state: oversized ? 'failed' : 'uploading',
      attachment: null,
      failure: oversized ? tooLarge(file.bytes) : null,
    },
  ]);
  if (!oversized) runUpload(key, file);
}

export function attachFiles(files: readonly PickedFile[], draftKey = DEFAULT_DRAFT_KEY): void {
  files.forEach((file) => {
    enqueue(file, draftKey);
  });
}

export function readyAttachments(list: readonly Upload[]): readonly string[] | null {
  if (list.some((item) => item.state !== 'done')) {
    return null;
  }
  return list.flatMap((item) => (item.attachment === null ? [] : [item.attachment.id]));
}

export async function commandUploadData(key: string): Promise<string> {
  const file = commandFiles.get(key);
  if (file === undefined)
    throw new Error('The original image is unavailable. Attach it again to run this command.');
  const buffer = await file.data();
  if (buffer.byteLength > ASSISTANT_ATTACHMENT_BYTES_MAX)
    throw new RangeError('The image exceeds the command attachment limit.');
  return base64Of(buffer, 0, buffer.byteLength);
}
export function clearSubmittedUploads(keys: readonly string[]): void {
  keys.forEach(removeUpload);
}
