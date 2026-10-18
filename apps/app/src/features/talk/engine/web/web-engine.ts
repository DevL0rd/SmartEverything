import {
  reduceTalk,
  type TalkEffect,
  type TalkInput,
  type TalkServerMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { notify } from '../../../../components/toast-store';
import { rawErrorText } from '../../../../format/errors';
import { TOKEN_WITHDRAWN, backoffOf } from '../../../../store/live-socket';
import {
  IDLE_TRANSMIT,
  engineState,
  sessionOf,
  type TalkConnection,
  type TalkEngine,
  type TalkEngineState,
} from '../engine-state';
import { openMicrophone, startCapture, type Capture } from './capture';
import { Playback } from './playback';
import { openTalkSocket, type TalkSocket } from './talk-socket';

const log = new Logger('app.talk-engine');

const EARLY_PACKETS_KEPT = 50;

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
    this.apply({ kind: 'press', channelId });
  };

  readonly listen = (channelId: string, cameraId: string): void => {
    if (!this.canTransmit()) {
      return;
    }
    this.playback.unlock();
    this.apply({ kind: 'listen', channelId, cameraId });
  };

  readonly leaveLive = (): void => {
    this.apply({ kind: 'leave_live' });
  };

  readonly release = (): void => {
    this.apply({ kind: 'release' });
  };

  private apply(input: TalkInput): void {
    const step = reduceTalk(sessionOf(engineState.get()), input, Date.now());
    update(() => step.session);
    step.effects.forEach((effect) => {
      this.perform(effect);
    });
  }

  private perform(effect: TalkEffect): void {
    switch (effect.kind) {
      case 'send':
        this.socket?.send(effect.message);
        return;
      case 'tone':
        this.playback.tone(effect.tone);
        return;
      case 'playback_begin':
        this.playback.begin();
        return;
      case 'playback_end':
        this.playback.end();
        return;
      case 'stop_capture':
        this.stopCapture();
        return;
      case 'flush_early_audio':
        this.early.splice(0).forEach((packet) => this.socket?.sendAudio(packet));
        return;
      case 'open_capture':
        this.beginCapture(effect);
        return;
    }
  }

  private beginCapture(effect: Extract<TalkEffect, { readonly kind: 'open_capture' }>): void {
    if (effect.purpose === 'live') {
      this.openCapture(
        () => engineState.get().live?.conversationId === effect.conversationId,
        this.leaveLive,
      );
      return;
    }
    this.pressRun += 1;
    const run = this.pressRun;
    this.openCapture(
      () => run === this.pressRun && engineState.get().transmit.status !== 'idle',
      this.release,
    );
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
        this.handle(message);
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

  private handle(message: TalkServerMessage): void {
    if (message.type === 'ready') {
      this.attempt = 0;
      update(() => ({ link: 'ready', problem: null }));
    }
    this.apply({ kind: 'message', message });
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
