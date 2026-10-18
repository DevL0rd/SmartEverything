import type {
  AssistantVoiceServerMessage,
  CallAudio,
  CallEnding,
  EchoTestOutcome,
  SightSource,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { rawErrorText } from '../../../../../format/errors';
import { Playback, openMicrophone, webTalkSupport } from '../../../../talk';
import {
  IDLE_CALL,
  callActive,
  callState,
  changeCall,
  markEnded,
  type CallFix,
} from '../../call-state';
import { applyServerMessage } from '../call-messages';
import type {
  CallEngine,
  CallLevelListener,
  CallRequest,
  LevelFeed,
  EngineCapabilities,
  SightStart,
} from '../call-engine';
import { CallFeatureUnavailableError } from '../unavailable';
import { DEFAULT_CALL_AUDIO, sinkIdOf } from './audio-settings';
import { CallLink, type LinkPorts } from './call-link';
import { applyLive } from './call-tuning';
import { refreshDevices, watchDevices } from './device-feed';
import { measureAlone, measureInCall } from './echo-run';
import { HUB_TOO_OLD } from '../hub-reasons';
import { engineCapabilities } from './engine-support';
import { MicrophoneChain, type MicrophoneHandlers } from './microphone';
import { SightActions } from './sight-actions';
import type { SightPorts } from './sight-desk';

const log = new Logger('app.assistant-call');

const SETTING_FAILED = 'That setting could not be applied. Your other changes were kept.';

export class WebCallEngine implements CallEngine {
  private mic: MicrophoneChain | null = null;
  private audio: CallAudio = DEFAULT_CALL_AUDIO;
  private muted = false;
  private testing = false;
  private request: CallRequest | null = null;
  private applying: Promise<void> = Promise.resolve();
  private readonly levelListeners = new Set<CallLevelListener>();
  private levelIn = 0;
  private levelOut = 0;
  private readonly playback = new Playback((error) => {
    this.fail('Speaker stopped working', error);
  });
  private readonly link = new CallLink(this.linkPorts());
  private readonly sight = new SightActions(this.sightPorts());

  constructor() {
    watchDevices((inputs) => this.mic?.deviceListChanged(inputs) ?? Promise.resolve());
    this.playback.onLevel((level) => {
      this.levelOut = level;
      this.publishLevels();
    });
  }

  readonly supported = webTalkSupport;

  readonly capabilities = (): EngineCapabilities => engineCapabilities(this.sight.lightReason());

  readonly start = (request: CallRequest): void => {
    if (callActive(callState.get())) {
      return;
    }
    const problem = webTalkSupport();
    if (problem !== null) {
      changeCall(() => ({ ...IDLE_CALL, phase: 'ended', ending: 'failed', problem }));
      return;
    }
    this.playback.setVolume(this.audio.volume);
    this.playback.setSink(sinkIdOf(this.audio)).catch((error: unknown) => {
      this.settingFailed('call.speaker_unavailable', error);
    });
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
    this.link.open();
  };

  readonly end = (): void => {
    const { callId } = callState.get();
    if (callId !== null) {
      this.link.send({ type: 'call_end', callId });
    }
    this.finish('hung_up', null);
  };

  readonly mute = (muted: boolean): void => {
    this.muted = muted;
    changeCall(() => ({ muted }));
    this.sendMute(muted);
    if (muted) {
      this.levelIn = 0;
      this.publishLevels();
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

  readonly levels: LevelFeed = {
    kind: 'events',
    subscribe: (listener) => {
      this.levelListeners.add(listener);
      listener({ in: this.levelIn, out: this.levelOut });
      return (): void => {
        this.levelListeners.delete(listener);
      };
    },
  };

  readonly applyAudio = (pref: CallAudio): void => {
    const previous = this.audio;
    this.audio = pref;
    if (callActive(callState.get())) {
      this.applying = this.applying.then(() => this.tune(previous, pref));
    }
  };

  readonly startSight = (start: SightStart): Promise<void> => this.sight.start(start);

  readonly stopSight = (source: SightSource): void => {
    this.sight.stop(source);
  };

  readonly switchCamera = (): Promise<void> => this.sight.switchCamera();

  readonly pauseSight = (paused: boolean): void => {
    this.sight.pause(paused);
  };

  readonly setLight = (on: boolean): void => {
    this.sight.light(on);
  };

  readonly showThis = (start: SightStart): Promise<void> => this.sight.show(start, randomUUID());

  readonly watchCamera = (cameraId: string): void => {
    this.sight.watch(cameraId);
  };

  readonly answerRequest = (requestId: string, accepted: boolean): void => {
    const { callId } = callState.get();
    changeCall(() => ({ request: null }));
    if (callId !== null) {
      this.link.send({ type: 'sight_answer', callId, requestId, accepted });
    }
  };

  readonly echoTest = (): Promise<EchoTestOutcome> => {
    const reason = engineCapabilities(null).echoTest;
    if (reason !== null) {
      return Promise.reject(new CallFeatureUnavailableError('The echo test', reason));
    }
    return callActive(callState.get())
      ? this.testInCall()
      : measureAlone(this.audio, this.playback);
  };

  readonly interrupt = (): void => {
    const { callId, capabilities } = callState.get();
    if (capabilities?.interrupt !== true) {
      throw new CallFeatureUnavailableError('Interrupting the assistant', HUB_TOO_OLD);
    }
    if (callId !== null) {
      this.link.send({ type: 'interrupt', callId });
    }
    this.playback.cut();
    this.playback.begin();
  };

  private linkPorts(): LinkPorts {
    const ports: LinkPorts = {
      request: () => this.request,
      message: (message) => {
        this.receive(message);
      },
      audio: (packet) => {
        this.playback.push(packet);
      },
      lost: (reason) => {
        this.finish('disconnected', reason);
      },
    };
    return ports;
  }

  private sightPorts(): SightPorts {
    const ports: SightPorts = {
      callId: () => callState.get().callId,
      hub: () => callState.get().capabilities,
      mode: () => this.audio.video_mode,
      facing: () => this.audio.facing,
      open: () => this.link.isOpen,
      message: (message) => {
        this.link.send(message);
      },
      picture: (bytes) => {
        this.link.sendPicture(bytes);
      },
      failure: (problem, error) => {
        this.sightFailed(problem, error);
      },
    };
    return ports;
  }

  private receive(message: AssistantVoiceServerMessage): void {
    if (message.type === 'call_state') {
      if (this.link.confirmed()) {
        this.mic?.gateReady?.reset();
      }
      this.announce(false);
    } else if (message.type === 'sight_state' && message.state === 'off') {
      this.sight.hubStopped(message.source, message.reason);
    }
    applyServerMessage(message, {
      capabilities: () => undefined,
      capture: (requestId, source, target) => {
        this.sight.capture(requestId, source, target);
      },
      ready: (available, reason) => {
        if (this.link.resume()) {
          return;
        }
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
    this.link.send({
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
    this.startMicrophone();
  }

  private startMicrophone(): void {
    const handlers: MicrophoneHandlers = {
      sink: {
        start: () => {
          this.heard(true);
        },
        packet: (packet) => {
          if (!this.testing) {
            this.link.sendAudio(packet);
          }
        },
        end: () => {
          this.heard(false);
        },
      },
      assistantAudible: () => this.playback.playing(),
      muted: () => this.muted,
      level: (level) => {
        this.levelIn = this.muted ? 0 : level;
        this.publishLevels();
      },
      failure: (problem, error) => {
        this.fail(problem, error);
      },
    };
    const mic = new MicrophoneChain(this.audio, handlers);
    this.mic = mic;
    mic.open().then(
      (stream) => {
        refreshDevices().catch((error: unknown) => {
          log.warn('call.devices_unreadable', { reason: rawErrorText(error) });
        });
        return mic.listen(stream).catch((error: unknown) => {
          this.fail('Speech detection could not start', error);
        });
      },
      (error: unknown) => {
        log.warn('call.microphone_refused', { reason: rawErrorText(error) });
        this.finish('failed', 'Microphone not available', 'microphone');
      },
    );
  }

  private publishLevels(): void {
    const levels = { in: this.levelIn, out: this.levelOut };
    for (const listener of this.levelListeners) {
      listener(levels);
    }
  }

  private heard(speaking: boolean): void {
    if (this.testing) {
      return;
    }
    changeCall(() => ({ speaking }));
    const { callId } = callState.get();
    if (callId !== null) {
      this.link.send({ type: 'activity', callId, speaking });
    }
  }

  private sendMute(muted: boolean): void {
    const { callId } = callState.get();
    if (callId !== null) {
      this.link.send({ type: 'mute', callId, muted });
    }
  }

  private announce(again: boolean): void {
    if (callState.get().capabilities !== null && (again || !this.link.hasAnnounced)) {
      this.link.markAnnounced();
      this.sight.announce(this.audio);
    }
  }

  private tune(previous: CallAudio, next: CallAudio): Promise<void> {
    return applyLive(previous, next, {
      mic: this.mic,
      playback: this.playback,
      sight: () => {
        this.sight.retarget();
        this.announce(true);
      },
      failed: (event, error) => {
        this.settingFailed(event, error);
      },
    });
  }

  private testInCall(): Promise<EchoTestOutcome> {
    const wasMuted = this.muted;
    return measureInCall({
      mic: this.mic,
      playback: this.playback,
      audio: this.audio,
      phase: callState.get().phase,
      hold: () => {
        this.testing = true;
        this.sendMute(true);
      },
      release: () => {
        this.testing = false;
        this.sendMute(wasMuted);
      },
    });
  }

  private settingFailed(event: string, error: unknown): void {
    log.warn(event, { reason: rawErrorText(error) });
    changeCall(() => ({ notice: SETTING_FAILED }));
  }

  private sightFailed(problem: string, error: unknown): void {
    log.warn('call.sight_failed', { problem, reason: rawErrorText(error) });
    this.sight.stopAll();
    changeCall(() => ({ notice: problem }));
  }

  private fail(problem: string, error: unknown): void {
    log.warn('call.failed', { problem, reason: rawErrorText(error) });
    this.finish('failed', problem);
  }

  private finish(ending: CallEnding, problem: string | null, fix: CallFix | null = null): void {
    this.testing = false;
    this.sight.stopAll();
    const mic = this.mic;
    this.mic = null;
    mic?.stop().catch((error: unknown) => {
      log.warn('call.speech_detection_stop_failed', { reason: rawErrorText(error) });
    });
    this.playback.cut();
    this.playback.tone('end');
    this.playback.end();
    this.link.close();
    this.request = null;
    markEnded({ ending, problem, ...(fix === null ? {} : { fix }) });
  }
}
