import AsyncStorage from '@react-native-async-storage/async-storage';
import { pairedUploadTransport } from './hub-transport';
import { PersistedUrlStorage } from './resume-store';
import { runUpload } from './run';
import type { UploadHandle, UploadRequest } from './types';

export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

const storage = new PersistedUrlStorage(AsyncStorage);

export function startUpload(request: UploadRequest): UploadHandle {
  return runUpload(request, {
    transport: pairedUploadTransport(),
    storage,
    chunkBytes: UPLOAD_CHUNK_BYTES,
  });
}
