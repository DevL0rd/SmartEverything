import type { CallAudioPref, SightSource, SightStopReason } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { callState, changeCall, changeVideo } from '../../call-state';
import type { SightStart } from '../call-engine';
import { SightStartError } from '../sight-failure';
import { CallFeatureUnavailableError } from '../unavailable';
import { HUB_TOO_OLD, engineCapabilities, reachableSources } from './engine-support';
import { SightDesk, type SightPorts } from './sight-desk';
import { startFailure } from './sight-devices';

const log = new Logger('app.assistant-call');

export class SightActions {
  private readonly desk: SightDesk;

  constructor(private readonly ports: SightPorts) {
    this.desk = new SightDesk(ports);
  }

  announce(audio: CallAudioPref): void {
    const { callId, capabilities } = callState.get();
    if (callId !== null && capabilities !== null) {
      this.ports.message({
        type: 'sight_settings',
        callId,
        mode: audio.video_mode,
        memorySeconds: audio.memory_seconds,
        look: audio.look,
        available: reachableSources(),
      });
    }
  }

  lightReason(): string | null {
    return this.desk.lightReason();
  }

  retarget(): void {
    this.desk.retarget();
  }

  stopAll(): void {
    this.desk.stopAll();
  }

  hubStopped(source: SightSource, reason: SightStopReason | null): void {
    this.desk.hubStopped(source, reason);
  }

  async start(start: SightStart): Promise<void> {
    this.require(start.source);
    try {
      await this.desk.start(start.source, start.facing ?? null, start.target ?? null);
    } catch (error) {
      this.failed(startFailure(start.source, error));
    }
  }

  stop(source: SightSource): void {
    if (source === 'home_camera') {
      this.stopHome();
      return;
    }
    this.desk.stop(source, true);
  }

  async switchCamera(): Promise<void> {
    this.require('phone_camera');
    const devices = await navigator.mediaDevices.enumerateDevices();
    await this.desk.switchCamera(
      devices.filter((device) => device.kind === 'videoinput').map((device) => device.deviceId),
    );
  }

  pause(paused: boolean): void {
    this.desk.setPaused(paused);
  }

  light(on: boolean): void {
    const reason = this.desk.lightReason();
    if (reason !== null) {
      throw new CallFeatureUnavailableError('The camera light', reason);
    }
    this.desk.setLight(on).catch((error: unknown) => {
      log.warn('call.light_failed', { reason: String(error) });
      changeCall(() => ({ notice: 'The camera light did not change.' }));
    });
  }

  async show(start: SightStart, lookId: string): Promise<void> {
    this.require(start.source);
    await this.desk.look({
      source: start.source,
      target: start.target ?? null,
      lookId,
      gesture: true,
    });
  }

  capture(requestId: string, source: SightStart['source'], target: string | null): void {
    this.desk
      .look({ source, target, lookId: requestId, gesture: navigator.userActivation.isActive })
      .catch((error: unknown) => {
        this.refuse(requestId, startFailure(source, error));
      });
  }

  private refuse(requestId: string, failure: SightStartError): void {
    const { callId } = callState.get();
    log.warn('call.look_refused', {
      source: failure.source,
      refusal: failure.refusal,
      reason: failure.detail,
    });
    if (callId !== null) {
      this.ports.message({
        type: 'sight_unavailable',
        callId,
        requestId,
        refusal: failure.refusal,
        detail: failure.detail.slice(0, 200),
      });
    }
  }

  watch(cameraId: string): void {
    const { callId, capabilities } = callState.get();
    if (capabilities === null) {
      throw new CallFeatureUnavailableError('Showing a home camera', HUB_TOO_OLD);
    }
    if (callId !== null) {
      this.ports.message({ type: 'watch_camera', callId, cameraId });
    }
  }

  private stopHome(): void {
    const { callId } = callState.get();
    if (callId !== null) {
      this.ports.message({ type: 'sight_stop', callId, source: 'home_camera' });
    }
  }

  private require(source: SightStart['source']): void {
    const reason = engineCapabilities(null).sight[source];
    if (reason !== null) {
      throw new SightStartError(source, 'unsupported', reason);
    }
  }

  private failed(failure: SightStartError): void {
    log.warn('call.sight_start_refused', {
      source: failure.source,
      refusal: failure.refusal,
      reason: failure.detail,
    });
    if (failure.source === 'phone_camera' && failure.refusal === 'denied') {
      changeVideo(() => ({ camera: 'denied' }));
    } else if (failure.source === 'phone_camera' && failure.refusal === 'busy') {
      changeVideo(() => ({ camera: 'busy' }));
    } else if (failure.refusal !== 'declined') {
      throw failure;
    }
  }
}
