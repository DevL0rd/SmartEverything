import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ApiError,
  MEDIA_PATHS,
  SIGNED_IMAGE_LINK,
  SIGNED_LINK,
  buildPath,
  type MediaLink,
  type MediaSize,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { RepeatGate } from './repeat-gate';

export const LINK_LIFETIME_SECONDS = 10 * 60;

const DRIVE_LINK = SIGNED_LINK.extend({ rev: z.coerce.number().int().positive() });

export interface VerifiedDriveLink {
  readonly rev: number;
  readonly expiresAt: Date;
}

const sizePart = (size: MediaSize): readonly string[] => [size];
const sizeQuery = (size: MediaSize): Readonly<Record<string, string>> => ({ size });
const revPart = (rev: number): string => `rev=${String(rev)}`;

const log = new Logger('hub.server');
const rejections = new RepeatGate(30_000);

function rejected(url: URL, reason: string, extra: Record<string, unknown> = {}): void {
  const suppressed = rejections.pass(`${url.pathname.split('/').slice(0, 4).join('/')}:${reason}`);
  if (suppressed === null) return;
  log.warn('media_link.rejected', {
    reason,
    pathHead: url.pathname.split('/').slice(0, 4).join('/'),
    suppressedSince: suppressed,
    ...extra,
  });
}

export class MediaLinks {
  private readonly key = randomBytes(32);

  constructor(private readonly now: () => Date) {}

  recording(recordingId: string, size: MediaSize): MediaLink {
    return this.sign(
      buildPath(MEDIA_PATHS.recording, { recordingId }),
      sizePart(size),
      sizeQuery(size),
    );
  }

  talkMessage(messageId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.talkMessage, { messageId }), []);
  }

  assistantAttachment(attachmentId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.assistantAttachment, { attachmentId }), []);
  }

  computerDownload(deviceId: string, ticketId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.computerDownload, { deviceId, ticketId }), []);
  }

  machineUpdate(file: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.machineUpdate, { file }), []);
  }

  appUpdateBlob(sha256: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.appUpdateBlob, { sha256 }), []);
  }

  androidApk(channel: string, scope: string, id: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.androidApk, { channel, scope, id }), []);
  }

  homeMapScan(mapId: string, hash: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.homeMapScan, { mapId, hash }), []);
  }

  cameraStream(deviceId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.cameraStream, { deviceId }), []);
  }

  cameraSnapshot(deviceId: string, size: MediaSize): MediaLink {
    return this.sign(
      buildPath(MEDIA_PATHS.cameraSnapshot, { deviceId }),
      sizePart(size),
      sizeQuery(size),
    );
  }

  driveFile(itemId: string, rev: number): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.driveFile, { itemId }), [revPart(rev)], { rev });
  }

  driveThumb(itemId: string, size: string, rev: number): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.driveThumb, { itemId, size }), [revPart(rev)], { rev });
  }

  verifyDrive(url: URL): VerifiedDriveLink {
    const link = this.parse(DRIVE_LINK, url);
    this.check(url, link.expires, link.signature, [revPart(link.rev)]);
    return { rev: link.rev, expiresAt: new Date(link.expires * 1000) };
  }

  verify(url: URL): void {
    const link = this.parse(SIGNED_LINK, url);
    this.check(url, link.expires, link.signature, []);
  }

  verifyImage(url: URL): MediaSize {
    const link = this.parse(SIGNED_IMAGE_LINK, url);
    this.check(url, link.expires, link.signature, sizePart(link.size));
    return link.size;
  }

  private parse<S extends z.ZodType>(schema: S, url: URL): z.output<S> {
    const link = schema.safeParse(Object.fromEntries(url.searchParams));
    if (!link.success) {
      rejected(url, 'unsigned', { queryKeys: [...url.searchParams.keys()].slice(0, 6) });
      throw new ApiError('unauthorized', 'This media path carries no valid signature.');
    }
    return link.data;
  }

  private check(url: URL, expires: number, signature: string, parts: readonly string[]): void {
    if (expires * 1000 <= this.now().getTime()) {
      rejected(url, 'expired', { expiredForMs: this.now().getTime() - expires * 1000 });
      throw new ApiError('link_expired', 'This media link has expired; ask for a new one.');
    }
    const expected = Buffer.from(this.signature(url.pathname, expires, parts), 'hex');
    const presented = Buffer.from(signature, 'hex');
    if (!timingSafeEqual(expected, presented)) {
      rejected(url, 'signature_mismatch', { signatureBytes: presented.length });
      throw new ApiError('unauthorized', 'This media link was not signed by this server.');
    }
  }

  private sign(
    path: string,
    parts: readonly string[],
    query: Readonly<Record<string, string | number>> = {},
  ): MediaLink {
    const expires = Math.floor(this.now().getTime() / 1000) + LINK_LIFETIME_SECONDS;
    const search = new URLSearchParams({
      expires: String(expires),
      signature: this.signature(path, expires, parts),
      ...Object.fromEntries(Object.entries(query).map(([name, value]) => [name, String(value)])),
    });
    return {
      url: `${path}?${search.toString()}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  private signature(path: string, expires: number, parts: readonly string[]): string {
    return createHmac('sha256', this.key)
      .update([path, String(expires), ...parts].join('\n'))
      .digest('hex');
  }
}
