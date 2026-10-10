import type { Logger } from '@smarteverything/logging';
import { Go2rtcError, type Go2rtcClient, type StreamConsumer } from './go2rtc-client';

const VIEWERS_AT_MOST = 4;
const CONSUMERS_WARNED_ABOVE = 6;

const HTTP_NOT_FOUND = 404;

export class CameraBusyError extends Error {
  override readonly name = 'CameraBusyError';

  constructor(deviceId: string, viewers: number) {
    super(
      `The camera ${deviceId} already has ${String(viewers)} viewers, the most it can stream to at once; close another view and try again.`,
    );
  }
}

export class CameraTalkUnsupportedError extends Error {
  override readonly name = 'CameraTalkUnsupportedError';

  constructor(deviceId: string) {
    super(`The camera ${deviceId} has no speaker, so it cannot take talk-back audio.`);
  }
}

type SessionKind = 'view' | 'talk';

export interface SessionRequest {
  readonly deviceId: string;
  readonly clientId: string;
  readonly kind: SessionKind;
  readonly answer: () => Promise<string>;
}

type ViewerClient = Pick<Go2rtcClient, 'consumers' | 'closeConsumer'>;

function isViewer(consumer: StreamConsumer): boolean {
  return consumer.format.startsWith('webrtc') || consumer.format.startsWith('mse');
}

function connected(consumer: StreamConsumer): boolean {
  return consumer.remote !== '';
}

function describe(consumers: readonly StreamConsumer[]): string[] {
  return consumers.map((consumer) =>
    [String(consumer.id), consumer.format, consumer.remote, consumer.userAgent]
      .filter((part) => part !== '')
      .join(' '),
  );
}

export class CameraViewers {
  private readonly sessions = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly client: ViewerClient,
    private readonly log: Logger,
  ) {}

  open(request: SessionRequest): Promise<string> {
    const previous = this.queues.get(request.deviceId) ?? Promise.resolve();
    const run = previous.then(
      () => this.openNow(request),
      () => this.openNow(request),
    );
    this.queues.set(request.deviceId, run);
    return run;
  }

  private async openNow(request: SessionRequest): Promise<string> {
    const key = `${request.clientId}/${request.deviceId}/${request.kind}`;
    await this.closePrevious(request.deviceId, key);
    const before = await this.client.consumers(request.deviceId);
    this.admit(request.deviceId, before);
    const answer = await request.answer();
    const known = new Set(before.map((consumer) => consumer.id));
    const added = (await this.client.consumers(request.deviceId)).find(
      (consumer) => isViewer(consumer) && !known.has(consumer.id),
    );
    if (added !== undefined) {
      this.sessions.set(key, added.id);
    }
    return answer;
  }

  private async closePrevious(deviceId: string, key: string): Promise<void> {
    const id = this.sessions.get(key);
    if (id === undefined) {
      return;
    }
    const previous = (await this.client.consumers(deviceId)).find((consumer) => consumer.id === id);
    if (previous === undefined) {
      this.sessions.delete(key);
      return;
    }
    if (!connected(previous)) {
      return;
    }
    this.sessions.delete(key);
    try {
      await this.client.closeConsumer(deviceId, id);
      this.log.info('camera.session_replaced', { deviceId, consumer: id });
    } catch (cause) {
      if (!(cause instanceof Go2rtcError && cause.status === HTTP_NOT_FOUND)) {
        throw cause;
      }
    }
  }

  private admit(deviceId: string, consumers: readonly StreamConsumer[]): void {
    if (consumers.length > CONSUMERS_WARNED_ABOVE) {
      this.log.warn('camera.consumers_high', {
        deviceId,
        count: consumers.length,
        consumers: describe(consumers),
      });
    }
    const viewers = consumers.filter((consumer) => isViewer(consumer) && connected(consumer));
    if (viewers.length >= VIEWERS_AT_MOST) {
      this.log.warn('camera.viewers_full', {
        deviceId,
        viewers: viewers.length,
        consumers: describe(consumers.filter(isViewer)),
      });
      throw new CameraBusyError(deviceId, viewers.length);
    }
  }
}

export function listenOnly(sdp: string): string {
  return sdp
    .split(/(?=^m=)/m)
    .map((section) =>
      section.startsWith('m=audio')
        ? section.replace(/^a=(sendrecv|sendonly)$/m, 'a=recvonly')
        : section,
    )
    .join('');
}
