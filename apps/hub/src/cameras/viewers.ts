import type { Logger } from '@smarteverything/logging';
import { Go2rtcError, type Go2rtcClient, type StreamConsumer } from './go2rtc-client';

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
  private readonly sessions = new Map<string, Map<string, number>>();
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
    const { deviceId } = request;
    const key = `${request.clientId}/${request.kind}`;
    const before = await this.client.consumers(deviceId);
    const sessions = this.liveSessions(deviceId, before);
    await this.closePrevious(deviceId, sessions, key, before);
    this.warnWhenCrowded(deviceId, before);
    const answer = await request.answer();
    const known = new Set(before.map((consumer) => consumer.id));
    const added = (await this.client.consumers(deviceId)).find(
      (consumer) => isViewer(consumer) && !known.has(consumer.id),
    );
    if (added !== undefined) {
      sessions.set(key, added.id);
    }
    this.log.debug('camera.session_opened', {
      deviceId,
      clientId: request.clientId,
      kind: request.kind,
      consumersBefore: before.length,
      consumer: added?.id,
      tracked: added !== undefined,
    });
    return answer;
  }

  private liveSessions(
    deviceId: string,
    consumers: readonly StreamConsumer[],
  ): Map<string, number> {
    const live = new Set(consumers.map((consumer) => consumer.id));
    const sessions = this.sessions.get(deviceId) ?? new Map<string, number>();
    for (const [key, id] of sessions) {
      if (!live.has(id)) {
        sessions.delete(key);
      }
    }
    this.sessions.set(deviceId, sessions);
    return sessions;
  }

  private async closePrevious(
    deviceId: string,
    sessions: Map<string, number>,
    key: string,
    consumers: readonly StreamConsumer[],
  ): Promise<void> {
    const id = sessions.get(key);
    const previous = consumers.find((consumer) => consumer.id === id);
    if (id === undefined || previous === undefined || !connected(previous)) {
      return;
    }
    sessions.delete(key);
    try {
      await this.client.closeConsumer(deviceId, id);
      this.log.info('camera.session_replaced', { deviceId, consumer: id });
    } catch (cause) {
      if (!(cause instanceof Go2rtcError && cause.status === HTTP_NOT_FOUND)) {
        throw cause;
      }
    }
  }

  private warnWhenCrowded(deviceId: string, consumers: readonly StreamConsumer[]): void {
    if (consumers.length > CONSUMERS_WARNED_ABOVE) {
      this.log.warn('camera.consumers_high', {
        deviceId,
        count: consumers.length,
        consumers: describe(consumers),
      });
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
