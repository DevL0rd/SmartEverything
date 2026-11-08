import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import type { UploadHandle } from '../../../nas/uploads/types';
import type { ServerConnection } from '../../../../api/connection/storage';
import { assertUploadActive } from '../../../nas/uploads/abort';
import { UPLOAD_CHUNK_BYTES } from '../../../nas/uploads/client';
import { connectionUploadTransport } from '../../../nas/uploads/hub-transport';
import { PersistedUrlStorage, RESUME_STORAGE_KEY } from '../../../nas/uploads/resume-store';
import { runUpload } from '../../../nas/uploads/run';
import type { ChargingSource } from './network-conditions';
import type { NativeMediaPort, UploadPort } from './ports';
import { createContentReader } from '../../../nas/uploads/content-reader';

interface PhotosNative {
  statMedia(ids: readonly string[], operation: string): Promise<unknown>;
  hashFile(uri: string, operation: string): Promise<unknown>;
  readRange(uri: string, operation: string, offset: number, bytes: number): Promise<unknown>;
  releaseChunk(uri: string): Promise<void>;
  prepare(operation: string): void;
  cancel(operation: string): void;
  charging(): Promise<unknown>;
  addListener(event: 'chargingChanged', listener: (value: unknown) => void): { remove(): void };
}

const native = requireOptionalNativeModule<PhotosNative>('PhotosBackup');
const HASH = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
});
const STATS = z.array(
  z.strictObject({
    id: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
    relativePath: z.string(),
    dateAddedSeconds: z.number().int().nonnegative(),
    modifiedSeconds: z.number().int().nonnegative(),
    isTrashed: z.boolean(),
    isPending: z.boolean(),
  }),
);
const CHARGING = z.strictObject({ charging: z.boolean() });
let sequence = 0;

function capability(): PhotosNative {
  if (native === null) throw new Error('Update the app to enable photo backup.');
  return native;
}

export function nativeBackupAvailable(): boolean {
  return native !== null;
}

async function cancellable<T>(
  read: (id: string) => Promise<T>,
  signal?: AbortSignal,
  dispose?: (answer: T) => Promise<void>,
): Promise<T> {
  assertUploadActive(signal);
  sequence += 1;
  const id = `photos-${String(sequence)}`;
  capability().prepare(id);
  const abort = (): void => {
    capability().cancel(id);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const answer = await read(id);
    if (signal?.aborted === true) await dispose?.(answer);
    assertUploadActive(signal);
    return answer;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export function createNativeMediaPort(): NativeMediaPort {
  return {
    async statMedia(ids, signal): ReturnType<NativeMediaPort['statMedia']> {
      assertUploadActive(signal);
      const result = STATS.parse(
        await cancellable((id) => capability().statMedia(ids, id), signal),
      );
      assertUploadActive(signal);
      return result;
    },
    async hashFile(uri, signal): ReturnType<NativeMediaPort['hashFile']> {
      return HASH.parse(await cancellable((id) => capability().hashFile(uri, id), signal));
    },
  };
}

export const chargingSource: ChargingSource = {
  async read(): Promise<boolean> {
    return z.boolean().parse(await capability().charging());
  },
  subscribe(listener): () => void {
    const subscription = capability().addListener('chargingChanged', (value) => {
      CHARGING.parse(value);
      listener();
    });
    return (): void => {
      subscription.remove();
    };
  },
};

async function readNativeChunk(
  uri: string,
  offset: number,
  bytes: number,
  signal: AbortSignal,
): Promise<Blob> {
  const chunkUri = z
    .string()
    .startsWith('file://')
    .parse(
      await cancellable(
        (id) => capability().readRange(uri, id, offset, bytes),
        signal,
        (answer) => capability().releaseChunk(z.string().parse(answer)),
      ),
    );
  try {
    const chunk = await (await fetch(chunkUri, { signal })).blob();
    assertUploadActive(signal);
    return chunk;
  } finally {
    await capability().releaseChunk(chunkUri);
  }
}

export function createBackupUploadPort(
  connection: ServerConnection,
  scopeKey: string,
  readChunk: typeof readNativeChunk = readNativeChunk,
): UploadPort {
  const storage = new PersistedUrlStorage(AsyncStorage, `${RESUME_STORAGE_KEY}.photos.${scopeKey}`);
  const transport = connectionUploadTransport(connection);
  return {
    start(request): UploadHandle {
      const source = { uri: request.uri, size: request.bytes, type: request.mimeType };
      const reader = createContentReader(
        source,
        (offset, bytes, signal) => readChunk(source.uri, offset, bytes, signal),
        UPLOAD_CHUNK_BYTES,
      );
      return runUpload(
        {
          identity: request.identity,
          source,
          name: request.name,
          target: { kind: 'folder', folderId: request.folderId },
          sha256: request.sha256,
        },
        {
          transport,
          storage,
          chunkBytes: UPLOAD_CHUNK_BYTES,
          input: reader.input,
          fileReader: reader.fileReader,
          closeReader: reader.close,
        },
      );
    },
  };
}
