import {
  ASSISTANT_VOICE_SERVER_MESSAGE,
  type AssistantVoiceClientMessage,
  type CallAudio,
  type CallEnding,
  type CallState,
  type EchoTestOutcome,
  type SightSource,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { Linking } from 'react-native';
import {
  addAssistantCallListeners,
  answerAssistantCall,
  applyAssistantCallAudio,
  assistantCallCan,
  attachAssistantCall,
  beginAssistantCall,
  endAssistantCall,
  muteAssistantCall,
  openAssistantCall,
  type CallControl,
} from '../../../../../../modules/health-connect';
import { rawErrorText } from '../../../../../format/errors';
import { jsonText } from '../../../../../format/json-text';
import {
  IDLE_CALL,
  callActive,
  callState,
  changeCall,
  markEnded,
  type CallFix,
} from '../../call-state';
import type { CallEngine, CallRequest, LevelFeed, SightStart } from '../call-engine';
import { applyServerMessage } from '../call-messages';
import { CallFeatureUnavailableError, NOT_ON_THIS_BUILD } from '../unavailable';
import { DEFAULT_CALL_AUDIO, nativeAudioOf } from './native-audio';
import { watchNativeDevices } from './native-devices';
import { measureNativeEcho } from './native-echo';
import { NATIVE_LEVELS } from './native-levels';
import { postCallMessage } from './native-messages';
import { Seeing } from './native-seeing';
import { HUB_TOO_OLD } from '../hub-reasons';
import {
  CALL_SERVICE_REFUSED_CODE,
  linkedReason,
  nativeCapabilities,
  reachableSources,
} from './native-support';

const log = new Logger('app.assistant-call');

const SETTING_FAILED = 'That setting could not be applied. Your other changes were kept.';

const ROUTE_FAILED = 'The speaker could not be switched. Pick another one in the call settings.';

const SCREEN_FAILED = 'Sharing your screen stopped working.';

const DROPPED = 'The connection to your home dropped.';

export class NativeCallEngine implements CallEngine {
  private listeners: { readonly remove: () => void } | null = null;
  private request: CallRequest | null = null;
  private audio: CallAudio = DEFAULT_CALL_AUDIO;
  private announced = false;
  private lostFrom: CallState | null = null;
  private applying: Promise<void> = Promise.resolve();
  private readonly seeing = new Seeing({
    audio: (): CallAudio => this.audio,
    send: (message): void => {
      this.send(message);
    },
  });

  constructor() {
    watchNativeDevices();
  }

  readonly supported = linkedReason;

  readonly capabilities = nativeCapabilities;

  readonly start = (next: CallRequest): void => {
    if (callActive(callState.get())) {
      return;
    }
    this.request = next;
    this.announced = false;
    this.lostFrom = null;
    const running = assistantCallCan('attachAssistantCall') ? attachAssistantCall() : null;
    changeCall(() => ({
      ...IDLE_CALL,
      phase: 'connecting',
      callId: running === null ? randomUUID() : running.callId,
      startedAt: running === null ? Date.now() : running.startedAt,
      chatId: next.chatId,
      muted: running?.muted === true,
    }));
    this.listen();
    if (running !== null) {
      running.replay.forEach((json) => {
        this.receive(json);
      });
      return;
    }
    this.open(next).catch((error: unknown) => {
      this.fail('The assistant could not start', error);
    });
  };

  private listen(): void {
    this.listeners = addAssistantCallListeners({
      message: (json) => {
        this.receive(json);
      },
      closed: (code, reason) => {
        this.closed(code, reason);
      },
      link: (state) => {
        this.linked(state);
      },
      control: (action) => {
        this.control(action);
      },
    });
  }

  readonly end = (): void => {
    this.finish('hung_up', null, null, callState.get().callId);
  };

  readonly mute = (muted: boolean): void => {
    const { callId } = callState.get();
    changeCall(() => ({ muted }));
    if (callId !== null) {
      muteAssistantCall(callId, muted).catch((error: unknown) => {
        this.fail('Mute did not work', error);
      });
    }
  };

  readonly allowMicrophone = async (): Promise<boolean> => {
    const microphone = await requestRecordingPermissionsAsync();
    if (!microphone.granted && !microphone.canAskAgain) {
      await Linking.openSettings();
    }
    return microphone.granted;
  };

  readonly levels: LevelFeed = NATIVE_LEVELS;

  readonly applyAudio = (pref: CallAudio): void => {
    const previous = this.audio;
    this.audio = pref;
    if (!assistantCallCan('applyAssistantCallAudio')) {
      if (callActive(callState.get())) {
        throw new CallFeatureUnavailableError('Live call settings', NOT_ON_THIS_BUILD);
      }
      return;
    }
    this.applying = this.applying.then(() => this.applyLive(previous, pref));
  };

  readonly startSight = (start: SightStart): Promise<void> => this.seeing.start(start);

  readonly stopSight = (source: SightSource): void => {
    this.seeing.stop(source);
  };

  readonly switchCamera = (): Promise<void> => {
    this.seeing.flip();
    return Promise.resolve();
  };

  readonly pauseSight = (paused: boolean): void => {
    this.seeing.pause(paused);
  };

  readonly setLight = (on: boolean): void => {
    this.seeing.light(on);
  };

  readonly showThis = (start: SightStart): Promise<void> => this.seeing.show(start);

  readonly watchCamera = (cameraId: string): void => {
    this.seeing.watch(cameraId);
  };

  readonly answerRequest = (requestId: string, accepted: boolean): void => {
    this.seeing.answer(requestId, accepted);
  };

  readonly echoTest = async (): Promise<EchoTestOutcome> => {
    const active = callActive(callState.get());
    if (active && callState.get().phase !== 'listening') {
      log.warn('call.echo_test_unavailable', { phase: callState.get().phase });
      return 'failed';
    }
    const wasMuted = callState.get().muted;
    if (active) {
      this.sendMute(true);
    }
    try {
      return await measureNativeEcho(this.audio);
    } catch (error) {
      log.warn('call.echo_test_failed', { reason: rawErrorText(error) });
      return 'failed';
    } finally {
      if (active) {
        this.sendMute(wasMuted);
      }
    }
  };

  readonly interrupt = (): void => {
    const { callId, capabilities } = callState.get();
    if (capabilities?.interrupt !== true) {
      throw new CallFeatureUnavailableError('Interrupting the assistant', HUB_TOO_OLD);
    }
    if (callId !== null) {
      this.send({ type: 'interrupt', callId });
    }
  };

  private async open(next: CallRequest): Promise<void> {
    await openAssistantCall(next.connection.url, next.connection.token);
    if (assistantCallCan('applyAssistantCallAudio')) {
      await applyAssistantCallAudio(nativeAudioOf(this.audio));
    }
  }

  private async begin(): Promise<void> {
    const { callId } = callState.get();
    const request = this.request;
    if (callId === null || request === null) {
      return;
    }
    const microphone = await requestRecordingPermissionsAsync();
    if (!microphone.granted) {
      this.finish('failed', 'Microphone not available', 'microphone', null);
      return;
    }
    const { source, device, chatId, answering } = request;
    await (answering === null
      ? beginAssistantCall(callId, source, device, chatId)
      : answerAssistantCall({ callId, source, device, chatId, answering }));
  }

  private receive(json: string): void {
    const read = jsonText(json);
    const parsed = read.ok ? ASSISTANT_VOICE_SERVER_MESSAGE.safeParse(read.value) : null;
    if (parsed?.success !== true) {
      log.warn('call.unreadable', { text: json.slice(0, 120) });
      return;
    }
    const message = parsed.data;
    if (message.type === 'call_state') {
      this.announce(false);
    } else if (message.type === 'sight_state' && message.state === 'off') {
      this.seeing.hubStopped(message.source);
    }
    applyServerMessage(message, {
      capabilities: () => undefined,
      capture: (requestId, source, target) => {
        this.seeing.capture(requestId, source, target);
      },
      ready: (available, reason) => {
        if (available) {
          this.begin().catch((error: unknown) => {
            this.fail('The assistant could not start', error);
          });
        } else {
          this.finish('failed', reason, null, null);
        }
      },
      interrupted: () => undefined,
      ended: (ending, detail) => {
        this.finish(ending, detail, null, null);
      },
    });
  }

  private control(action: CallControl): void {
    switch (action) {
      case 'screen_ended':
        this.seeing.stopScreen();
        return;
      case 'screen_failed':
        this.seeing.stopScreen();
        changeCall(() => ({ notice: SCREEN_FAILED }));
        return;
      case 'route_failed':
        changeCall(() => ({ notice: ROUTE_FAILED }));
        return;
      case 'speech_started':
        changeCall(() => ({ speaking: true }));
        return;
      case 'speech_ended':
        changeCall(() => ({ speaking: false }));
    }
  }

  private linked(state: 'reconnecting' | 'live'): void {
    if (state === 'reconnecting') {
      const { phase } = callState.get();
      if (phase !== 'reconnecting' && phase !== 'idle' && phase !== 'ended') {
        this.lostFrom = phase;
      }
      changeCall(() => ({ phase: 'reconnecting', speaking: false }));
      return;
    }
    const back = this.lostFrom;
    changeCall((call) => (call.phase === 'reconnecting' && back !== null ? { phase: back } : {}));
  }

  private closed(code: number, reason: string): void {
    if (!callActive(callState.get())) {
      return;
    }
    log.warn('call.socket_closed', { code, reason });
    this.finish(
      code === CALL_SERVICE_REFUSED_CODE ? 'failed' : 'disconnected',
      reason === '' ? DROPPED : reason,
      null,
      null,
    );
  }

  private announce(force: boolean): void {
    const { callId, capabilities } = callState.get();
    if (callId === null || capabilities === null || (this.announced && !force)) {
      return;
    }
    this.announced = true;
    this.send({
      type: 'sight_settings',
      callId,
      mode: this.audio.video_mode,
      memorySeconds: this.audio.memory_seconds,
      look: this.audio.look,
      available: reachableSources(),
    });
  }

  private async applyLive(previous: CallAudio, next: CallAudio): Promise<void> {
    await applyAssistantCallAudio(nativeAudioOf(next)).catch((error: unknown) => {
      this.settingFailed('call.audio_apply_failed', error);
    });
    if (!callActive(callState.get())) {
      return;
    }
    if (previous.video_mode !== next.video_mode) {
      this.seeing.setMode(next.video_mode);
    }
    if (this.announced) {
      this.announce(true);
    }
  }

  private send(message: AssistantVoiceClientMessage): void {
    postCallMessage(message).catch((error: unknown) => {
      log.warn('call.message_failed', { type: message.type, reason: rawErrorText(error) });
    });
  }

  private sendMute(muted: boolean): void {
    const { callId } = callState.get();
    if (callId !== null) {
      this.send({ type: 'mute', callId, muted });
    }
  }

  private settingFailed(event: string, error: unknown): void {
    log.warn(event, { reason: rawErrorText(error) });
    changeCall(() => ({ notice: SETTING_FAILED }));
  }

  private fail(problem: string, error: unknown): void {
    log.warn('call.native_failed', { problem, reason: rawErrorText(error) });
    this.finish('failed', problem, null, null);
  }

  private finish(
    ending: CallEnding,
    problem: string | null,
    fix: CallFix | null,
    callId: string | null,
  ): void {
    this.seeing.release();
    this.listeners?.remove();
    this.listeners = null;
    this.request = null;
    this.announced = false;
    this.lostFrom = null;
    endAssistantCall(callId).catch((error: unknown) => {
      log.warn('call.native_end_failed', { reason: rawErrorText(error) });
    });
    markEnded({ ending, problem, ...(fix === null ? {} : { fix }) });
  }
}
