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

let counter = 0;

export function useUploads(): readonly Upload[] {
  return useValue(uploads);
}

function patch(key: string, change: Partial<Upload>): void {
  uploads.update((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
}

export function removeUpload(key: string): void {
  uploads.update((list) => list.filter((item) => item.key !== key));
}

export function clearUploads(): void {
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
    const start = index * upload.chunkBytes;
    const end = Math.min(data.byteLength, start + upload.chunkBytes);
    await sendAssistantUploadChunk(upload.uploadId, index, base64Of(data, start, end));
    patch(key, { progress: end / data.byteLength });
  }
  const attachment = await finishAssistantUpload(upload.uploadId);
  patch(key, { state: 'done', progress: 1, attachment });
}

function enqueue(file: PickedFile): void {
  counter += 1;
  const key = `upload-${String(counter)}`;
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
  send(key, file).catch((error: unknown) => {
    log.warn('upload.failed', { reason: String(error) });
    patch(key, { state: 'failed' });
    notify({ message: `${file.name} couldn’t be attached`, error, tone: 'critical' });
  });
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
