import { once } from 'node:events';
import {
  EndBehaviorType,
  NetworkingStatusCode,
  VoiceConnectionStatus,
  type AudioReceiveStream,
  type DAVESession,
  type VoiceReceiver,
} from '@discordjs/voice';
import type { DaveTrouble, VoiceClosing } from './link';
import { messageOf } from '@smarteverything/logging';

const PASSTHROUGH_SECONDS = 30;
const REARM_MS = 5000;
const NOT_READY_REPORT_MS = 5000;
const ENCRYPT_FAILURE_LIMIT = 50;
const DECRYPT_BURST = { count: 200, windowMs: 60_000 } as const;
const RESYNC =
  /Session (initialized|reinitialized|reset|upgraded)|Preparing for (transition|epoch)|Transition executed|MLS (welcome|commit) processed|Invalidating transition/;
const DECRYPT_FAILED = 'Failed to decrypt a packet';
const DECRYPT_ERROR = 'Failed to decrypt';

interface GuardedNetworking {
  readonly code: NetworkingStatusCode;
  readonly dave?: DAVESession | undefined;
}

interface GuardedState {
  readonly status: VoiceConnectionStatus;
  readonly networking?: { readonly state: GuardedNetworking };
}

export interface GuardedConnection {
  readonly state: GuardedState;
  readonly prepareAudioPacket: (packet: Buffer) => Buffer | undefined;
  readonly on: {
    (event: 'debug', listener: (message: string) => void): unknown;
    (event: 'stateChange', listener: (before: unknown, after: GuardedState) => void): unknown;
  };
}

export type GuardedReceiver = Pick<VoiceReceiver, 'subscribe' | 'subscriptions'>;

const RESUBSCRIBES = 3;

export interface DaveOutlets {
  readonly report: (trouble: DaveTrouble) => void;
  readonly giveUp: (reason: VoiceClosing, cause: unknown) => void;
}

function closed(stream: AudioReceiveStream): Promise<unknown> {
  return stream.closed ? Promise.resolve() : once(stream, 'close');
}

function isDecryptFailure(cause: unknown): boolean {
  return messageOf(cause).includes(DECRYPT_ERROR);
}

export class DaveGuard {
  private failures: number[] = [];
  private encryptFailures = 0;
  private armedAt = Number.NEGATIVE_INFINITY;
  private notReadyAt = Number.NEGATIVE_INFINITY;
  private readonly settledListeners: (() => void)[] = [];

  constructor(
    private readonly connection: GuardedConnection,
    private readonly outlets: DaveOutlets,
  ) {
    connection.on('debug', (message: string) => {
      this.debugged(message);
    });
    connection.on('stateChange', (_before, after) => {
      if (after.status === VoiceConnectionStatus.Ready) {
        this.arm();
      }
    });
    const prepare = connection.prepareAudioPacket.bind(connection);
    Object.assign(connection, {
      prepareAudioPacket: (packet: Parameters<typeof prepare>[0]): ReturnType<typeof prepare> => {
        try {
          const prepared = prepare(packet);
          this.encryptFailures = 0;
          return prepared;
        } catch (cause) {
          this.encryptFailed(cause);
          return undefined;
        }
      },
    });
  }

  ready(): boolean {
    const dave = this.dave();
    return dave === undefined || dave.protocolVersion === 0 || dave.session?.ready === true;
  }

  settled(timeoutMs: number): Promise<void> {
    if (this.ready()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.report('not_ready', 'The DAVE session was not ready in time', 'waiting');
        done();
      }, timeoutMs);
      this.settledListeners.push(done);
    });
  }

  notReady(): void {
    const now = Date.now();
    if (now - this.notReadyAt >= NOT_READY_REPORT_MS) {
      this.notReadyAt = now;
      this.report('not_ready', 'Audio dropped: the DAVE session is not ready', 'dropped');
    }
  }

  async *listen(
    receiver: GuardedReceiver,
    userId: string,
    silenceMs: number,
  ): AsyncGenerator<Uint8Array> {
    for (let attempt = 0; attempt <= RESUBSCRIBES; attempt += 1) {
      if (receiver.subscriptions.has(userId)) {
        return;
      }
      const stream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: silenceMs },
      });
      try {
        yield* stream;
        return;
      } catch (cause) {
        if (!isDecryptFailure(cause)) {
          throw cause;
        }
        this.arm();
        this.report('decrypt', messageOf(cause), 'resubscribed');
        await closed(stream);
      }
    }
  }

  private dave(): DAVESession | undefined {
    const { state } = this.connection;
    if (state.status !== VoiceConnectionStatus.Ready || state.networking === undefined) {
      return undefined;
    }
    const networking = state.networking.state;
    return networking.code === NetworkingStatusCode.Ready ||
      networking.code === NetworkingStatusCode.Resuming
      ? networking.dave
      : undefined;
  }

  private debugged(message: string): void {
    if (RESYNC.test(message)) {
      this.arm();
      if (this.ready()) {
        this.settledListeners.splice(0).forEach((done) => {
          done();
        });
      }
    }
    if (message.includes(DECRYPT_FAILED)) {
      this.decryptFailed(message);
    }
  }

  private decryptFailed(message: string): void {
    const now = Date.now();
    this.failures = [...this.failures.filter((at) => at > now - DECRYPT_BURST.windowMs), now];
    if (this.failures.length > DECRYPT_BURST.count) {
      this.report('decrypt', message, 'ended');
      this.outlets.giveUp('decrypt', null);
      return;
    }
    if (now - this.armedAt >= REARM_MS) {
      this.arm();
      this.report('decrypt', message, 'passthrough');
    }
  }

  private encryptFailed(cause: unknown): void {
    this.encryptFailures += 1;
    if (this.encryptFailures === 1) {
      this.report('encrypt', messageOf(cause), 'dropped');
    }
    if (this.encryptFailures === ENCRYPT_FAILURE_LIMIT) {
      this.report('encrypt', messageOf(cause), 'ended');
      this.outlets.giveUp('closed', cause);
    }
  }

  private arm(): void {
    this.armedAt = Date.now();
    try {
      const session = this.dave()?.session;
      session?.setPassthroughMode(true, PASSTHROUGH_SECONDS);
      session?.setPassthroughMode(false, PASSTHROUGH_SECONDS);
    } catch (cause) {
      this.report('session', messageOf(cause), 'dropped');
    }
  }

  private report(
    stage: DaveTrouble['stage'],
    message: string,
    recovery: DaveTrouble['recovery'],
  ): void {
    const dave = this.dave();
    this.outlets.report({
      stage,
      message,
      protocolVersion: dave?.protocolVersion ?? null,
      ready: dave?.session?.ready ?? null,
      reinitializing: dave?.reinitializing ?? null,
      lastTransitionId: dave?.lastTransitionId ?? null,
      recovery,
    });
  }
}
