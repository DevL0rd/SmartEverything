import {
  type AppSightSource,
  type AssistantVoiceClientMessage,
  type CallAudioPref,
  type CallCapabilities,
  type SightFacing,
  type SightMode,
  type SightSource,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { rawErrorText } from '../../../../../format/errors';
import { callState, changeCall } from '../../call-state';
import type { SightStart } from '../call-engine';
import { SightStartError } from '../sight-failure';
import { CallFeatureUnavailableError } from '../unavailable';
import { postCallMessage } from './native-messages';
import { NativeSight, sightFailureOf } from './native-sight';
import { HUB_TOO_OLD } from '../hub-reasons';
import { nativeCapabilities } from './native-support';

const log = new Logger('app.assistant-call');

export interface SeeingPorts {
  readonly audio: () => CallAudioPref;
  readonly send: (message: AssistantVoiceClientMessage) => void;
}

export class Seeing {
  private readonly sight: NativeSight;

  constructor(private readonly ports: SeeingPorts) {
    this.sight = new NativeSight({
      callId: (): string | null => callState.get().callId,
      hub: (): CallCapabilities | null => callState.get().capabilities,
      mode: (): SightMode => ports.audio().video_mode,
      facing: (): SightFacing => ports.audio().facing,
      open: (): boolean => callState.get().phase !== 'reconnecting',
      send: postCallMessage,
      failure: (problem: string, error: unknown): void => {
        this.failed(problem, error);
      },
    });
  }

  async start(start: SightStart): Promise<void> {
    this.require(start.source);
    try {
      if (start.source === 'phone_camera') {
        await this.sight.startCamera(start.facing ?? null);
      } else {
        await this.sight.startScreen();
      }
    } catch (error) {
      throw sightFailureOf(start.source, error);
    }
  }

  stop(source: SightSource): void {
    if (source === 'home_camera') {
      this.stopHomeCamera();
      return;
    }
    this.sight.stop(source, true);
  }

  stopScreen(): void {
    this.sight.stop('phone_screen', true);
  }

  hubStopped(source: SightSource): void {
    this.sight.stop(source, false);
  }

  flip(): void {
    this.sight.flip();
  }

  pause(paused: boolean): void {
    this.sight.pause(paused);
  }

  light(on: boolean): void {
    this.sight.light(on);
  }

  setMode(mode: SightMode): void {
    this.sight.setMode(mode);
  }

  release(): void {
    this.sight.release();
  }

  async show(start: SightStart): Promise<void> {
    this.require(start.source);
    try {
      await this.sight.look({
        source: start.source,
        target: start.target ?? start.facing ?? null,
        lookId: randomUUID(),
      });
    } catch (error) {
      throw sightFailureOf(start.source, error);
    }
  }

  capture(requestId: string, source: AppSightSource, target: string | null): void {
    const { callId } = callState.get();
    if (callId === null) {
      return;
    }
    this.sight.look({ source, target, lookId: requestId }).catch((error: unknown) => {
      const failure = sightFailureOf(source, error);
      log.warn('call.look_refused', { source, reason: failure.detail });
      this.ports.send({
        type: 'sight_unavailable',
        callId,
        requestId,
        refusal: failure.refusal,
        detail: failure.detail.slice(0, 200),
      });
    });
  }

  watch(cameraId: string): void {
    const { callId, capabilities } = callState.get();
    if (capabilities === null) {
      throw new CallFeatureUnavailableError('Showing a home camera', HUB_TOO_OLD);
    }
    if (callId !== null) {
      this.ports.send({ type: 'watch_camera', callId, cameraId });
    }
  }

  answer(requestId: string, accepted: boolean): void {
    const { callId } = callState.get();
    changeCall(() => ({ request: null }));
    if (callId !== null) {
      this.ports.send({ type: 'sight_answer', callId, requestId, accepted });
    }
  }

  private stopHomeCamera(): void {
    const { callId } = callState.get();
    if (callId !== null) {
      this.ports.send({ type: 'sight_stop', callId, source: 'home_camera' });
    }
  }

  private require(source: AppSightSource): void {
    const reason = nativeCapabilities().sight[source];
    if (reason !== null) {
      throw new SightStartError(source, 'unsupported', reason);
    }
  }

  private failed(problem: string, error: unknown): void {
    log.warn('call.sight_failed', { problem, reason: rawErrorText(error) });
    changeCall(() => ({ notice: problem }));
  }
}
