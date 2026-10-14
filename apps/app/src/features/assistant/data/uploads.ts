import {
  ASSISTANT_ATTACHMENTS_MAX,
  ASSISTANT_ATTACHMENT_BYTES_MAX,
  type AssistantAttachment,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  finishAssistantUpload,
  sendAssistantUploadChunk,
  startAssistantUpload,
} from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { bytes } from '../../../format/number';
import type { PickedFile } from '../../../platform/pick-files';

const log = new Logger('app.assistant');

export type UploadState = 'uploading' | 'done' | 'failed';

export interface Upload {
  readonly key: string;
  readonly name: string;
  readonly mime: string;
  readonly preview: string | null;
  readonly progress: number;
  readonly state: UploadState;
  readonly attachment: AssistantAttachment | null;
}

const uploads = new ValueStore<readonly Upload[]>([]);
const uploadFiles = new Map<string, PickedFile>();
const commandFiles = new Map<string, PickedFile>();

let counter = 0;

export function useUploads(): readonly Upload[] {
  return useValue(uploads);
}

function patch(key: string, change: Partial<Upload>): void {
  uploads.update((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
}

export function removeUpload(key: string): void {
  uploadFiles.delete(key);
  commandFiles.delete(key);
  uploads.update((list) => list.filter((item) => item.key !== key));
}

export function clearUploads(): void {
  uploadFiles.clear();
  commandFiles.clear();
  uploads.set([]);
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
    throw new RangeError(`${file.name} is over ${bytes(ASSISTANT_ATTACHMENT_BYTES_MAX)}.`);
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
    log.warn('upload.failed', { reason: String(error) });
    patch(key, { state: 'failed' });
    notify({ message: `${file.name} couldn’t be attached`, error, tone: 'critical' });
  });
}

export function retryUpload(key: string): void {
  const source = uploadFiles.get(key);
  const upload = uploads.get().find((item) => item.key === key);
  if (source === undefined || upload?.state !== 'failed') return;
  patch(key, { state: 'uploading', progress: 0, attachment: null });
  runUpload(key, source);
}

function enqueue(file: PickedFile): void {
  counter += 1;
  const key = `upload-${String(counter)}`;
  uploadFiles.set(key, file);
  commandFiles.set(key, file);
  uploads.update((list) => [
    ...list,
    {
      key,
      name: file.name,
      mime: file.mime,
      preview: file.preview,
      progress: 0,
      state: 'uploading',
      attachment: null,
    },
  ]);
  runUpload(key, file);
}

export function attachFiles(files: readonly PickedFile[]): void {
  const room = ASSISTANT_ATTACHMENTS_MAX - uploads.get().length;
  if (files.length > room) {
    notify({
      message: `Up to ${String(ASSISTANT_ATTACHMENTS_MAX)} files per message`,
      tone: 'critical',
    });
  }
  files.slice(0, Math.max(0, room)).forEach(enqueue);
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
