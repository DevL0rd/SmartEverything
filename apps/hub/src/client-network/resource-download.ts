import { createWriteStream } from 'node:fs';
import { chmod, mkdtemp, rename, rm, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import type { ResourceAdmission } from './resource-broker.js';
import type { HubLeasePort } from './lease.js';
import { HubTransportError } from './policy.js';
import { openResourceResponse, RESOURCE_HIGH_WATER_MARK } from './resource-http.js';

const log = new Logger('hub.media-resource');
const TEMPORARY_FILE_LIFETIME_MS = 10 * 60 * 1000;
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
  private active = 0;
  constructor(readonly policies: HubLeasePort) {}
  async write(admission: ResourceAdmission, destination?: string): Promise<string> {
    if (this.active >= 4) throw new HubTransportError('Resource download capacity reached');
    this.active += 1;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(
        join(
          destination === undefined ? tmpdir() : dirname(destination),
          '.smarteverything-media-',
        ),
      );
      const file = await this.stream(admission, directory);
      admission.signal.throwIfAborted();
      if (destination === undefined) {
        this.retireTemporary(directory, admission.signal);
        return file;
      }
      await chmod(file, 0o600);
      await rename(file, destination);
      return destination;
    } catch (cause) {
      if (directory !== undefined) await rm(directory, { recursive: true, force: true });
      throw cause;
    } finally {
      this.active -= 1;
      if (destination !== undefined && directory !== undefined)
        await rm(directory, { recursive: true, force: true });
    }
  }
  private retireTemporary(directory: string, signal: AbortSignal): void {
    const clean = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', clean);
      void rm(directory, { recursive: true, force: true }).catch((cause: unknown): void => {
        log.warn('resource.cleanup_failed', {
          error_name: cause instanceof Error ? cause.name : 'unknown',
        });
      });
    };
    const timer = setTimeout(clean, TEMPORARY_FILE_LIFETIME_MS);
    timer.unref();
    signal.addEventListener('abort', clean, { once: true });
    if (signal.aborted) {
      clean();
      signal.throwIfAborted();
    }
  }
  private async stream(admission: ResourceAdmission, directory: string): Promise<string> {
    const response = await openResourceResponse(this.policies, admission.input, {
      method: 'GET',
      headers: {},
      signal: admission.signal,
    });
    if (response.statusCode !== 200) {
      response.destroy();
      throw new HubTransportError('Resource download requires a complete successful response');
    }
    try {
      const capacity = await statfs(directory, { bigint: true });
      const size = response.headers['content-length'];
      if (
        size !== undefined &&
        (!/^\d+$/.test(size) || BigInt(size) > capacity.bavail * capacity.bsize)
      ) {
        response.destroy();
        throw new HubTransportError(
          'Resource download has insufficient free space or invalid length',
        );
      }
      const mime = response.headers['content-type']?.split(';')[0]?.trim();
      const extension = mime === undefined ? '.bin' : (FILE_EXTENSIONS[mime] ?? '.bin');
      const path = join(directory, `${randomBytes(16).toString('hex')}${extension}`);
      await pipeline(
        response,
        createWriteStream(path, {
          flags: 'wx',
          mode: 0o600,
          highWaterMark: RESOURCE_HIGH_WATER_MARK,
        }),
        { signal: admission.signal },
      );
      await chmod(path, 0o400);
      return path;
    } catch (cause) {
      response.destroy();
      throw cause;
    }
  }
}
