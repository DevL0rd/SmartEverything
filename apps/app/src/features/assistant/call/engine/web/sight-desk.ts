import {
  sightFrameOf,
  type AppSightSource,
  type AssistantVoiceClientMessage,
  type CallCapabilities,
  type SightFacing,
  type SightMode,
  type SightSource,
  type SightStopReason,
} from '@smarteverything/domain';
import { changeVideo, type CameraPhase } from '../../call-state';
import { callPreviews } from '../../preview-store';
import { SightStartError } from '../sight-failure';
import { openCamera, stopStream, type OpenedSight } from './sight-devices';
import { desktopStill } from './desktop-still';
import { facingOfTarget, laneOf, nextCamera, opening, type Lane } from './sight-lanes';
import { SightSampler, type SamplerHandlers } from './sight-sampler';

const SETTLE_FRAMES = 4;

const NEEDS_CHOOSING =
  'The browser needs them to choose what to share. Ask them to press Share and pick it first.';

export interface SightPorts {
  readonly callId: () => string | null;
  readonly hub: () => CallCapabilities | null;
  readonly mode: () => SightMode;
  readonly facing: () => SightFacing;
  readonly open: () => boolean;
  readonly message: (message: AssistantVoiceClientMessage) => void;
  readonly picture: (bytes: Uint8Array) => void;
  readonly failure: (problem: string, error: unknown) => void;
}

export interface LookRequest {
  readonly source: AppSightSource;
  readonly target: string | null;
  readonly lookId: string;
  readonly gesture: boolean;
}

interface Session {
  readonly opened: OpenedSight;
  readonly sampler: SightSampler;
}

interface Glimpse {
  readonly source: AppSightSource;
  readonly label: string;
  readonly jpeg: Uint8Array;
}

export class SightDesk {
  private camera: Session | null = null;
  private screen: Session | null = null;
  private sent: Lane | null = null;
  private paused = false;
  private starting = false;

  constructor(private readonly ports: SightPorts) {}

  get cameraOpen(): boolean {
    return this.camera !== null;
  }

  lightReason(): string | null {
    const track = this.camera?.opened.stream.getVideoTracks()[0];
    if (track === undefined) {
      return 'Turn the camera on first.';
    }
    return track.getCapabilities().torch === true ? null : 'This camera has no light.';
  }

  async start(
    source: AppSightSource,
    facing: SightFacing | null,
    deviceId: string | null,
  ): Promise<void> {
    if (this.starting) {
      throw new SightStartError(source, 'busy', 'Another picture source is still starting');
    }
    this.starting = true;
    const camera = laneOf(source) === 'camera';
    changeVideo(() => (camera ? { camera: 'starting' } : { screen: 'starting' }));
    try {
      const opened = await opening(source, {
        facing: facing ?? this.ports.facing(),
        deviceId: camera ? deviceId : null,
      });
      this.take(opened);
    } finally {
      this.starting = false;
      this.publish();
    }
  }

  stop(source: SightSource, tell: boolean): void {
    const lane = laneOf(source);
    if (lane === null || this.session(lane)?.opened.source !== source) {
      return;
    }
    const wasSent = this.sent === lane;
    this.release(lane);
    if (wasSent && tell) {
      this.message({ type: 'sight_stop', callId: this.callId(source), source });
      if (lane === 'screen') {
        this.send('camera');
      }
    }
    this.publish();
  }

  hubStopped(source: SightSource, reason: SightStopReason | null): void {
    const lane = laneOf(source);
    if (lane === null || this.sent !== lane || this.session(lane)?.opened.source !== source) {
      return;
    }
    if (lane === 'camera' && reason === 'replaced') {
      this.sent = null;
      this.retarget();
    } else {
      this.release('camera');
      this.release('screen');
    }
    this.publish();
  }

  stopAll(): void {
    this.release('camera');
    this.release('screen');
    this.publish();
  }

  async switchCamera(devices: readonly string[]): Promise<void> {
    const current = this.camera?.opened;
    if (current === undefined) {
      throw new SightStartError('phone_camera', 'failed', 'The camera is not on');
    }
    const opened = await openCamera(nextCamera(current, devices));
    const resend = this.sent === 'camera';
    this.release('camera');
    this.camera = this.sessionOf(opened);
    if (resend) {
      this.send('camera');
    }
    this.publish();
  }

  setPaused(paused: boolean): void {
    if (this.camera === null) {
      throw new SightStartError('phone_camera', 'failed', 'The camera is not on');
    }
    this.paused = paused;
    this.retarget();
    this.publish();
  }

  async setLight(on: boolean): Promise<void> {
    const track = this.camera?.opened.stream.getVideoTracks()[0];
    if (track === undefined) {
      throw new SightStartError('phone_camera', 'failed', 'The camera is not on');
    }
    await track.applyConstraints({ advanced: [{ torch: on }] });
    changeVideo(() => ({ light: on }));
  }

  retarget(): void {
    const live = this.ports.mode() === 'live';
    this.camera?.sampler.setStreaming(live && this.sent === 'camera' && !this.paused);
    this.screen?.sampler.setStreaming(live && this.sent === 'screen');
  }

  async look(request: LookRequest): Promise<void> {
    const glimpse = await this.glimpse(request);
    this.message({
      type: 'sight_still',
      callId: this.callId(glimpse.source),
      source: glimpse.source,
      label: glimpse.label,
      lookId: request.lookId,
    });
    this.ports.picture(sightFrameOf({ source: glimpse.source, still: true, jpeg: glimpse.jpeg }));
  }

  private session(lane: Lane | null): Session | null {
    return lane === 'camera' ? this.camera : lane === 'screen' ? this.screen : null;
  }

  private async glimpse(request: LookRequest): Promise<Glimpse> {
    const { source } = request;
    const lane = laneOf(source);
    const shown = this.session(lane);
    if (shown !== null) {
      const jpeg = await shown.sampler.still(0);
      return { source: shown.opened.source, label: shown.opened.label, jpeg };
    }
    if (source === 'desktop_screen' || source === 'desktop_window') {
      const still = await desktopStill(source, request.target);
      if (still !== null) {
        return still;
      }
    }
    if (lane === 'screen' && !request.gesture) {
      throw new SightStartError(source, 'denied', NEEDS_CHOOSING);
    }
    const opened = await opening(source, {
      facing: facingOfTarget(request.target, this.ports.facing()),
      deviceId: null,
    });
    return this.fleeting(opened);
  }

  private async fleeting(opened: OpenedSight): Promise<Glimpse> {
    const sampler = this.sampler(opened, () => false);
    try {
      const jpeg = await sampler.still(SETTLE_FRAMES);
      return { source: opened.source, label: opened.label, jpeg };
    } finally {
      sampler.stop();
      stopStream(opened.stream);
    }
  }

  private take(opened: OpenedSight): void {
    const lane = laneOf(opened.source);
    if (lane === null) {
      stopStream(opened.stream);
      return;
    }
    if (lane === 'screen' || this.sent === 'screen') {
      this.release('screen');
    }
    this.release(lane);
    try {
      const session = this.sessionOf(opened);
      if (lane === 'camera') {
        this.camera = session;
      } else {
        this.screen = session;
      }
      this.send(lane);
    } catch (error) {
      this.release(lane);
      stopStream(opened.stream);
      throw error;
    }
  }

  private send(lane: Lane): void {
    const session = this.session(lane);
    if (session === null) {
      return;
    }
    const { opened } = session;
    this.sent = lane;
    this.message({
      type: 'sight_start',
      callId: this.callId(opened.source),
      source: opened.source,
      label: opened.label,
      ...(opened.facing === null ? {} : { facing: opened.facing }),
    });
    this.retarget();
  }

  private sessionOf(opened: OpenedSight): Session {
    const lane = laneOf(opened.source);
    const sampler = this.sampler(opened, () => this.sent === lane && this.ports.open());
    opened.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (this.session(lane)?.opened === opened) {
        this.stop(opened.source, true);
      }
    });
    return { opened, sampler };
  }

  private sampler(opened: OpenedSight, streams: () => boolean): SightSampler {
    const [track] = opened.stream.getVideoTracks();
    const hub = this.ports.hub();
    if (track === undefined || hub === null) {
      stopStream(opened.stream);
      throw new SightStartError(opened.source, 'failed', 'The call is not ready for pictures');
    }
    const handlers: SamplerHandlers = {
      open: streams,
      send: (jpeg) => {
        this.ports.picture(sightFrameOf({ source: opened.source, still: false, jpeg }));
      },
      failure: (error) => {
        this.ports.failure('The picture source stopped working', error);
      },
    };
    const limits = { maxBytes: hub.maxFrameBytes, minIntervalMs: hub.minFrameIntervalMs };
    return new SightSampler(track, opened.source, limits, handlers);
  }

  private release(lane: Lane): void {
    const session = this.session(lane);
    if (session === null) {
      return;
    }
    if (lane === 'camera') {
      this.camera = null;
      this.paused = false;
    } else {
      this.screen = null;
    }
    if (this.sent === lane) {
      this.sent = null;
    }
    session.sampler.stop();
    stopStream(session.opened.stream);
  }

  private publish(): void {
    const sent = this.session(this.sent);
    const camera = this.camera;
    callPreviews.set({
      sent:
        sent === null
          ? null
          : { stream: sent.opened.stream, mirrored: sent.opened.facing === 'front' },
      self:
        camera === null || this.sent === 'camera'
          ? null
          : { stream: camera.opened.stream, mirrored: camera.opened.facing === 'front' },
    });
    changeVideo((video) => ({
      camera: this.cameraPhase(video.camera),
      facing: camera?.opened.facing ?? video.facing,
      light: camera === null ? false : video.light,
      screen: this.screen === null ? (this.starting ? video.screen : 'off') : 'on',
    }));
  }

  private cameraPhase(current: CameraPhase): CameraPhase {
    if (this.camera === null) {
      return this.starting && current === 'starting' ? 'starting' : 'off';
    }
    return this.paused ? 'paused' : 'on';
  }

  private message(message: AssistantVoiceClientMessage): void {
    this.ports.message(message);
  }

  private callId(source: AppSightSource): string {
    const callId = this.ports.callId();
    if (callId === null) {
      throw new SightStartError(source, 'failed', 'There is no call to show things in');
    }
    return callId;
  }
}
