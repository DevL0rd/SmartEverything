import type { TalkServerMessage } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { notify } from '../../../../components/toast-store';
import { rawErrorText } from '../../../../format/errors';
import { TOKEN_WITHDRAWN, backoffOf } from '../../../../store/live-socket';
import {
  IDLE_TRANSMIT,
  engineState,
  type TalkConnection,
  type TalkEngine,
  type TalkEngineState,
} from '../engine-state';
import { openMicrophone, startCapture, type Capture } from './capture';
import { Playback } from './playback';
import { openTalkSocket, type TalkSocket } from './talk-socket';

const log = new Logger('app.talk-engine');

const EARLY_PACKETS_KEPT = 50;

type Handlers = {
  readonly [K in TalkServerMessage['type']]: (
    message: Extract<TalkServerMessage, { readonly type: K }>,
  ) => void;
};

function update(change: (state: TalkEngineState) => Partial<TalkEngineState>): void {
  engineState.update((state) => ({ ...state, ...change(state) }));
}

export function webTalkSupport(): string | null {
  if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') {
    return 'This browser has no Opus audio codecs (WebCodecs).';
  }
  if (typeof MediaStreamTrackProcessor === 'undefined') {
    return 'This browser cannot read microphone frames (MediaStreamTrackProcessor).';
  }
  return null;
}

export class WebTalkEngine implements TalkEngine {
  private socket: TalkSocket | null = null;
  private connection: TalkConnection | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private capture: Capture | null = null;
  private early: Uint8Array[] = [];
  private pressRun = 0;
  private readonly playback = new Playback((error) => {
    this.failed('talk.playback_failed', error);
  });

  readonly supported = webTalkSupport;

  readonly start = (connection: TalkConnection): void => {
    const problem = webTalkSupport();
    if (problem !== null) {
      update(() => ({ link: 'unsupported', problem }));
      return;
    }
    this.connection = connection;
    this.open();
  };

  readonly stop = (): void => {
    this.connection = null;
    this.clearRetry();
    this.stopCapture();
    this.socket?.close();
    this.socket = null;
    this.playback.close();
    update(() => ({
      link: 'off',
      problem: null,
      transmit: IDLE_TRANSMIT,
      receive: null,
      live: null,
    }));
  };

  readonly press = (channelId: string): void => {
    if (!this.canTransmit()) {
      return;
    }
    this.playback.unlock();
    this.pressRun += 1;
    const run = this.pressRun;
    update(() => ({ transmit: { ...IDLE_TRANSMIT, status: 'requesting', channelId } }));
    this.socket?.send({ type: 'press', channelId });
    this.openCapture(
      () => run === this.pressRun && engineState.get().transmit.status !== 'idle',
      this.release,
    );
  };

  readonly listen = (channelId: string, cameraId: string): void => {
    if (!this.canTransmit()) {
      return;
    }
    this.playback.unlock();
    update(() => ({ transmit: { ...IDLE_TRANSMIT, status: 'requesting', channelId, cameraId } }));
    this.socket?.send({ type: 'listen', channelId, cameraId });
  };

  readonly leaveLive = (): void => {
    if (engineState.get().live === null) {
      return;
    }
    this.socket?.send({ type: 'release' });
    this.closeLive();
  };

  readonly release = (): void => {
    if (engineState.get().transmit.status === 'idle') {
      return;
    }
    this.socket?.send({ type: 'release' });
    this.stopCapture();
    update(() => ({ transmit: IDLE_TRANSMIT }));
  };

  private readonly handlers: Handlers = {
    live_start: (message) => {
      const live = {
        channelId: message.channelId,
        conversationId: message.conversationId,
        label: message.label,
      };
      update(() => ({ live }));
      this.playback.begin();
      if (engineState.get().transmit.status === 'idle') {
        this.openCapture(
          () => engineState.get().live?.conversationId === live.conversationId,
          this.leaveLive,
        );
      }
    },
    live_end: (message) => {
      if (engineState.get().live?.conversationId === message.conversationId) {
        this.closeLive();
      }
    },
    ready: () => {
      this.attempt = 0;
      update(() => ({ link: 'ready', problem: null }));
    },
    channels: () => undefined,
    granted: (message) => {
      const { transmit } = engineState.get();
      if (transmit.status !== 'requesting' || transmit.channelId !== message.channelId) {
        this.socket?.send({ type: 'release' });
        return;
      }
      update((state) => ({
        transmit: {
          ...state.transmit,
          status: 'talking',
          messageId: message.messageId,
          startedAt: Date.now(),
          limitSeconds: message.limitSeconds,
        },
      }));
      this.playback.tone('permit');
      this.early.splice(0).forEach((packet) => this.socket?.sendAudio(packet));
    },
    denied: (message) => {
      this.stopCapture();
      update(() => ({
        transmit: IDLE_TRANSMIT,
        lastDenial: { channelId: message.channelId, reason: message.reason },
      }));
      this.playback.tone('busy');
    },
    ended: (message) => {
      if (engineState.get().transmit.messageId !== message.messageId) {
        return;
      }
      this.stopCapture();
      update(() => ({ transmit: IDLE_TRANSMIT, lastEnding: message.reason }));
      this.playback.tone('end');
    },
    rx_start: (message) => {
      this.playback.begin();
      update(() => ({
        receive: {
          channelId: message.channelId,
          messageId: message.messageId,
          speaker: message.speaker,
          startedAt: Date.now(),
        },
      }));
    },
    rx_end: (message) => {
      if (engineState.get().receive?.messageId !== message.messageId) {
        return;
      }
      this.playback.end();
      this.playback.tone('roger');
      update(() => ({ receive: null }));
    },
  };

  private closeLive(): void {
    if (engineState.get().transmit.status === 'idle') {
      this.stopCapture();
    }
    this.playback.end();
    update(() => ({ live: null }));
  }

  private openCapture(keep: () => boolean, refused: () => void): void {
    openMicrophone().then(
      (stream) => {
        if (!keep()) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        this.capture = startCapture(stream, {
          onPacket: (packet) => {
            this.packet(packet);
          },
          onLevel: (level) => {
            update(() => ({ level }));
          },
          onFailure: (error) => {
            this.failed('talk.capture_failed', error);
          },
        });
      },
      (error: unknown) => {
        notify({ message: 'Microphone not available', error, tone: 'critical' });
        refused();
      },
    );
  }

  private canTransmit(): boolean {
    const state = engineState.get();
    if (state.live !== null) {
      notify({
        message: `${state.live.label} is talking with you`,
        detail: 'Stop the conversation first.',
      });
      return false;
    }
    if (state.link !== 'ready') {
      notify(
        state.problem === null
          ? { message: 'Walkie-talkie isn’t connected' }
          : { message: 'Walkie-talkie isn’t connected', detail: state.problem },
      );
      return false;
    }
    return state.transmit.status === 'idle';
  }

  private packet(packet: Uint8Array): void {
    const { transmit } = engineState.get();
    if (transmit.status === 'talking' || engineState.get().live !== null) {
      this.socket?.sendAudio(packet);
    } else if (this.early.length < EARLY_PACKETS_KEPT) {
      this.early.push(packet);
    }
  }

  private stopCapture(): void {
    this.capture?.stop();
    this.capture = null;
    this.early = [];
  }

  private open(): void {
    const connection = this.connection;
    if (connection === null) {
      return;
    }
    update(() => ({ link: 'connecting' }));
    this.socket = openTalkSocket(connection, {
      onOpen: () => {
        log.debug('talk.socket_opened', { attempt: this.attempt });
      },
      onMessage: (message) => {
        this.handle(message.type, message);
      },
      onAudio: (packet) => {
        this.playback.push(packet);
      },
      onUnreadable: (reason) => {
        log.warn('talk.unreadable', { reason });
      },
      onClose: (code, reason) => {
        this.closed(code, reason);
      },
    });
  }

  private handle<T extends TalkServerMessage['type']>(
    type: T,
    message: Extract<TalkServerMessage, { readonly type: T }>,
  ): void {
    const handler: Handlers[T] = this.handlers[type];
    handler(message);
  }

  private closed(code: number, reason: string): void {
    this.socket = null;
    this.stopCapture();
    this.playback.end();
    log.info('talk.socket_closed', { code, reason });
    if (this.connection === null) {
      return;
    }
    const problem =
      code === TOKEN_WITHDRAWN
        ? 'This device was removed from your home.'
        : 'Can’t reach your server';
    update(() => ({
      link: 'offline',
      problem,
      transmit: IDLE_TRANSMIT,
      receive: null,
      live: null,
    }));
    if (code === TOKEN_WITHDRAWN) {
      return;
    }
    this.retry = setTimeout(() => {
      this.retry = null;
      this.open();
    }, backoffOf(this.attempt));
    this.attempt += 1;
  }

  private clearRetry(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  private failed(event: string, error: unknown): void {
    log.warn(event, { reason: rawErrorText(error) });
  }
}
