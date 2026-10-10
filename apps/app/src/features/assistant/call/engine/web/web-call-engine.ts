import type { AssistantVoiceServerMessage, CallEnding } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { rawErrorText } from '../../../../../format/errors';
import {
  Playback,
  openMicrophone,
  startCapture,
  webTalkSupport,
  type Capture,
} from '../../../../talk';
import {
  IDLE_CALL,
  callActive,
  callState,
  changeCall,
  markEnded,
  type CallFix,
} from '../../call-state';
import { applyServerMessage } from '../call-messages';
import type { CallEngine, CallRequest } from '../call-engine';
import { openCallSocket, type CallSocket } from './call-socket';
import { openSpeechGate, type WebSpeechGate } from './speech-gate';

const log = new Logger('app.assistant-call');

export class WebCallEngine implements CallEngine {
  private socket: CallSocket | null = null;
  private capture: Capture | null = null;
  private gate: WebSpeechGate | null = null;
  private muted = false;
  private level = 0;
  private request: CallRequest | null = null;
  private readonly playback = new Playback((error) => {
    this.fail('Speaker stopped working', error);
  });

  readonly supported = webTalkSupport;

  readonly start = (request: CallRequest): void => {
    if (callActive(callState.get())) {
      return;
    }
    const problem = webTalkSupport();
    if (problem !== null) {
      changeCall(() => ({ ...IDLE_CALL, phase: 'ended', ending: 'failed', problem }));
      return;
    }
    this.playback.unlock();
    this.request = request;
    this.muted = false;
    changeCall(() => ({
      ...IDLE_CALL,
      phase: 'connecting',
      callId: randomUUID(),
      startedAt: Date.now(),
      chatId: request.chatId,
    }));
    this.socket = openCallSocket(request.connection, {
      onMessage: (message) => {
        this.receive(message);
      },
      onAudio: (packet) => {
        this.playback.push(packet);
      },
      onUnreadable: (reason) => {
        log.warn('call.unreadable', { reason });
      },
      onClose: (code, reason) => {
        this.closed(code, reason);
      },
    });
  };

  readonly end = (): void => {
    const { callId } = callState.get();
    if (callId !== null) {
      this.socket?.send({ type: 'call_end', callId });
    }
    this.finish('hung_up', null);
  };

  readonly mute = (muted: boolean): void => {
    const { callId } = callState.get();
    this.muted = muted;
    changeCall(() => ({ muted }));
    if (callId !== null) {
      this.socket?.send({ type: 'mute', callId, muted });
    }
  };

  readonly allowMicrophone = async (): Promise<boolean> => {
    try {
      const stream = await openMicrophone();
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      return true;
    } catch (error) {
      log.warn('call.microphone_still_refused', { reason: rawErrorText(error) });
      return false;
    }
  };

  readonly inputLevel = (): number => (this.muted ? 0 : this.level);

  readonly outputLevel = (): number => this.playback.outputLevel();

  private receive(message: AssistantVoiceServerMessage): void {
    applyServerMessage(message, {
      ready: (available, reason) => {
        if (available) {
          this.begin();
        } else {
          this.finish('failed', reason);
        }
      },
      interrupted: () => {
        this.playback.cut();
        this.playback.begin();
      },
      ended: (ending, detail) => {
        this.finish(ending, detail);
      },
    });
  }

  private begin(): void {
    const { callId } = callState.get();
    const request = this.request;
    if (callId === null || request === null) {
      return;
    }
    this.socket?.send({
      type: 'call_start',
      callId,
      source: request.source,
      ...(request.chatId === null ? {} : { chatId: request.chatId }),
      ...(request.answering === null ? {} : { answering: request.answering }),
      device: request.device,
      gated: true,
    });
    this.playback.begin();
    this.playback.tone('permit');
    openMicrophone().then(
      (stream) => {
        if (!callActive(callState.get())) {
          stream.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        this.listen(stream);
        this.capture = startCapture(stream, {
          onPacket: (packet) => {
            if (!this.muted) {
              this.gate?.packet(packet);
            }
          },
          onLevel: (level) => {
            this.level = level;
          },
          onFailure: (error) => {
            this.fail('Microphone stopped working', error);
          },
        });
      },
      (error: unknown) => {
        log.warn('call.microphone_refused', { reason: rawErrorText(error) });
        this.finish('failed', 'Microphone not available', 'microphone');
      },
    );
  }

  private listen(stream: MediaStream): void {
    openSpeechGate(
      stream,
      {
        start: () => {
          this.activity(true);
        },
        packet: (packet) => {
          this.socket?.sendAudio(packet);
        },
        end: () => {
          this.activity(false);
        },
      },
      () => this.playback.playing(),
    ).then(
      (gate) => {
        if (callActive(callState.get())) {
          this.gate = gate;
        } else {
          this.stopGate(gate);
        }
      },
      (error: unknown) => {
        this.fail('Speech detection could not start', error);
      },
    );
  }

  private activity(speaking: boolean): void {
    const { callId } = callState.get();
    if (callId !== null) {
      this.socket?.send({ type: 'activity', callId, speaking });
    }
  }

  private stopGate(gate: WebSpeechGate): void {
    gate.stop().catch((error: unknown) => {
      log.warn('call.speech_detection_stop_failed', { reason: rawErrorText(error) });
    });
  }

  private closed(code: number, reason: string): void {
    if (!callActive(callState.get())) {
      return;
    }
    log.warn('call.socket_closed', { code, reason });
    this.finish('disconnected', reason === '' ? 'The connection to your home dropped.' : reason);
  }

  private fail(problem: string, error: unknown): void {
    log.warn('call.failed', { problem, reason: rawErrorText(error) });
    this.finish('failed', problem);
  }

  private finish(ending: CallEnding, problem: string | null, fix: CallFix | null = null): void {
    this.capture?.stop();
    this.capture = null;
    if (this.gate !== null) {
      this.stopGate(this.gate);
      this.gate = null;
    }
    this.level = 0;
    this.playback.cut();
    this.playback.tone('end');
    this.playback.end();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.request = null;
    markEnded({ ending, problem, ...(fix === null ? {} : { fix }) });
  }
}
