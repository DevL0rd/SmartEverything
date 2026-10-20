import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MediaSize } from '@smarteverything/domain';
import {
  CameraOfflineError,
  CameraPrivacyError,
  UnknownStreamError,
} from '../../cameras/camera-service';
import type { Store } from '../../store/store';
import { IntegrationError } from './integration-error';
import type { OneShotPicture } from './one-shot-model';

const PICTURE_BYTES_MAX = 4 * 1024 * 1024;

const PICTURE_TYPE = 'image/jpeg';

export interface TakenPicture {
  readonly id: string;
  readonly at: string;
}

export interface CameraPictures {
  readonly take: (deviceId: string, size: MediaSize) => Promise<TakenPicture>;
  readonly load: (pictureId: string) => Promise<OneShotPicture>;
}

export interface StoredPicturesPorts {
  readonly snapshot: (deviceId: string, size: MediaSize) => Promise<Uint8Array>;
  readonly recordings: Pick<Store['cameras'], 'addRecording' | 'recording'>;
  readonly recordingPath: (storagePath: string) => string;
  readonly now: () => Date;
}

function stamp(at: Date): string {
  return at.toISOString().replace(/[-:.]/g, '');
}

export class StoredPictures implements CameraPictures {
  constructor(private readonly ports: StoredPicturesPorts) {}

  async take(deviceId: string, size: MediaSize): Promise<TakenPicture> {
    const bytes = await this.frame(deviceId, size);
    const at = this.ports.now();
    const storagePath = `${deviceId}/${stamp(at)}-${randomUUID().slice(0, 8)}-automation.jpg`;
    const path = this.ports.recordingPath(storagePath);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    const row = this.ports.recordings.addRecording({
      deviceId,
      eventId: null,
      kind: 'snapshot',
      storagePath,
      startedAt: at.toISOString(),
      durationMs: null,
      bytes: bytes.byteLength,
    });
    return { id: row.id, at: at.toISOString() };
  }

  private async frame(deviceId: string, size: MediaSize): Promise<Uint8Array> {
    try {
      return await this.ports.snapshot(deviceId, size);
    } catch (cause) {
      if (cause instanceof CameraPrivacyError) throw new IntegrationError('Refused', cause.message);
      if (cause instanceof CameraOfflineError) {
        throw new IntegrationError('Unreachable', cause.message);
      }
      if (cause instanceof UnknownStreamError)
        throw new IntegrationError('NotFound', cause.message);
      throw cause;
    }
  }

  async load(pictureId: string): Promise<OneShotPicture> {
    const row = this.recordOf(pictureId);
    const path = this.ports.recordingPath(row.storage_path);
    const { size } = await stat(path);
    if (size > PICTURE_BYTES_MAX) {
      throw new IntegrationError(
        'LimitExceeded',
        `The picture is ${String(size)} bytes, more than the ${String(PICTURE_BYTES_MAX)} the AI accepts.`,
      );
    }
    return { mimeType: PICTURE_TYPE, base64: (await readFile(path)).toString('base64') };
  }

  private recordOf(pictureId: string): ReturnType<Store['cameras']['recording']> {
    try {
      const row = this.ports.recordings.recording(pictureId);
      if (row.kind !== 'snapshot') {
        throw new IntegrationError('Invalid', `${pictureId} is a video clip, not a picture.`);
      }
      return row;
    } catch (cause) {
      if (cause instanceof IntegrationError) throw cause;
      throw new IntegrationError('NotFound', `There is no picture ${pictureId}.`);
    }
  }
}
