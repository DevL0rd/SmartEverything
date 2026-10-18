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
import type { z } from 'zod';
import { RepeatGate } from './repeat-gate';

const LINK_LIFETIME_SECONDS = 10 * 60;

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
    return this.sign(buildPath(MEDIA_PATHS.recording, { recordingId }), size);
  }

  talkMessage(messageId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.talkMessage, { messageId }), null);
  }

  assistantAttachment(attachmentId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.assistantAttachment, { attachmentId }), null);
  }

  computerDownload(deviceId: string, ticketId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.computerDownload, { deviceId, ticketId }), null);
  }

  machineUpdate(file: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.machineUpdate, { file }), null);
  }

  cameraStream(deviceId: string): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.cameraStream, { deviceId }), null);
  }

  cameraSnapshot(deviceId: string, size: MediaSize): MediaLink {
    return this.sign(buildPath(MEDIA_PATHS.cameraSnapshot, { deviceId }), size);
  }

  verify(url: URL): void {
    const link = this.parse(SIGNED_LINK, url);
    this.check(url, link.expires, link.signature, null);
  }

  verifyImage(url: URL): MediaSize {
    const link = this.parse(SIGNED_IMAGE_LINK, url);
    this.check(url, link.expires, link.signature, link.size);
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

  private check(url: URL, expires: number, signature: string, size: MediaSize | null): void {
    if (expires * 1000 <= this.now().getTime()) {
      rejected(url, 'expired', { expiredForMs: this.now().getTime() - expires * 1000 });
      throw new ApiError('link_expired', 'This media link has expired; ask for a new one.');
    }
    const expected = Buffer.from(this.signature(url.pathname, expires, size), 'hex');
    const presented = Buffer.from(signature, 'hex');
    if (!timingSafeEqual(expected, presented)) {
      rejected(url, 'signature_mismatch', { signatureBytes: presented.length });
      throw new ApiError('unauthorized', 'This media link was not signed by this server.');
    }
  }

  private sign(path: string, size: MediaSize | null): MediaLink {
    const expires = Math.floor(this.now().getTime() / 1000) + LINK_LIFETIME_SECONDS;
    const query = new URLSearchParams({
      expires: String(expires),
      signature: this.signature(path, expires, size),
      ...(size === null ? {} : { size }),
    });
    return {
      url: `${path}?${query.toString()}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  private signature(path: string, expires: number, size: MediaSize | null): string {
    return createHmac('sha256', this.key)
      .update([path, String(expires), ...(size === null ? [] : [size])].join('\n'))
      .digest('hex');
  }
}
