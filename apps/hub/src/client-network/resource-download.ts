import { createWriteStream } from 'node:fs';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import type { ResourceAdmission } from './resource-broker';
import type { HubLeasePort } from './lease';
import { HubTransportError } from './policy';
import { openHubResource } from './transport';

const log = new Logger('hub.media-resource');
const FILE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
  'application/json': '.json',
  'text/plain': '.txt',
  'text/html': '.txt',
  'text/css': '.txt',
  'text/javascript': '.txt',
};
export class HubResourceDownloads {
  constructor(readonly policies: HubLeasePort) {}
  async write(admission: ResourceAdmission, destination?: string): Promise<string> {
    const directory = await mkdtemp(
      join(destination === undefined ? tmpdir() : dirname(destination), '.smarteverything-media-'),
    );
    try {
      const file = await this.stream(admission, directory);
      admission.signal.throwIfAborted();
      if (destination === undefined) {
        this.removeWhenReleased(directory, admission.signal);
        return file;
      }
      await rename(file, destination);
      await rm(directory, { recursive: true, force: true });
      return destination;
    } catch (cause) {
      await rm(directory, { recursive: true, force: true });
      throw cause;
    }
  }
  private removeWhenReleased(directory: string, signal: AbortSignal): void {
    signal.addEventListener(
      'abort',
      () => {
        void rm(directory, { recursive: true, force: true }).catch((cause: unknown): void => {
          log.warn('resource.cleanup_failed', {
            error_name: cause instanceof Error ? cause.name : 'unknown',
          });
        });
      },
      { once: true },
    );
  }
  private async stream(admission: ResourceAdmission, directory: string): Promise<string> {
    const response = await openHubResource(this.policies, admission.input, {
      headers: {},
      signal: admission.signal,
    });
    if (response.statusCode !== 200) {
      response.body.destroy();
      throw new HubTransportError('Resource download requires a complete successful response');
    }
    const contentType = response.headers['content-type'];
    const mime = typeof contentType === 'string' ? contentType.split(';')[0]?.trim() : undefined;
    const extension = mime === undefined ? '.bin' : (FILE_EXTENSIONS[mime] ?? '.bin');
    const path = join(directory, `${randomBytes(16).toString('hex')}${extension}`);
    await pipeline(response.body, createWriteStream(path, { flags: 'wx', mode: 0o600 }), {
      signal: admission.signal,
    });
    return path;
  }
}
