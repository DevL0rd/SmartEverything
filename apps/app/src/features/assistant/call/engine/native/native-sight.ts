import {
  SIGHT_FACING,
  SIGHT_FRAME_LIMITS,
  SIGHT_SAMPLING,
  SIGHT_SOURCES,
  type AppSightSource,
  type AssistantVoiceClientMessage,
  type CallCapabilities,
  type SightFacing,
  type SightMode,
  type SightSource,
} from '@smarteverything/domain';
import type { NativeFrameSampling } from '../../../../../../modules/health-connect';
import { rawErrorText } from '../../../../../format/errors';
import { SightStartError } from '../sight-failure';
import { NativeCamera } from './native-camera';
import { NativeScreen } from './native-screen';

const COMPUTER_ONLY = 'Showing a computer screen or window needs the desktop app.';

const SCREEN_DECLINED = 'They did not allow sharing the screen.';

export interface SightPorts {
  readonly callId: () => string | null;
  readonly hub: () => CallCapabilities | null;
  readonly mode: () => SightMode;
  readonly facing: () => SightFacing;
  readonly open: () => boolean;
  readonly send: (message: AssistantVoiceClientMessage) => Promise<void>;
  readonly failure: (problem: string, error: unknown) => void;
}

export interface LookRequest {
  readonly source: AppSightSource;
  readonly target: string | null;
  readonly lookId: string;
}

function samplingOf(source: AppSightSource, hub: CallCapabilities | null): NativeFrameSampling {
  const sampling = SIGHT_SAMPLING[source];
  return {
    sourceCode: SIGHT_SOURCES.indexOf(source),
    longEdge: sampling.longEdge,
    quality: sampling.quality,
    minIntervalMs: Math.max(sampling.minIntervalMs, hub?.minFrameIntervalMs ?? 0),
    maxBytes: hub?.maxFrameBytes ?? SIGHT_FRAME_LIMITS.maxBytes,
    live: true,
  };
}

function cameraLabel(facing: SightFacing): string {
  return facing === 'front' ? 'Front camera' : 'Back camera';
}

export function sightFailureOf(source: AppSightSource, error: unknown): SightStartError {
  return error instanceof SightStartError
    ? error
    : new SightStartError(source, 'failed', rawErrorText(error));
}

export class NativeSight {
  private readonly camera: NativeCamera;
  private readonly screen: NativeScreen;

  constructor(private readonly ports: SightPorts) {
    this.camera = new NativeCamera({
      sampling: (): NativeFrameSampling => samplingOf('phone_camera', ports.hub()),
      streaming: (): boolean => ports.mode() === 'live' && ports.open(),
      failure: (problem: string, error: unknown): void => {
        this.stop('phone_camera', true);
        ports.failure(problem, error);
      },
    });
    this.screen = new NativeScreen(() => samplingOf('phone_screen', ports.hub()));
  }

  async startCamera(facing: SightFacing | null): Promise<void> {
    const chosen = facing ?? this.ports.facing();
    await this.camera.open(chosen);
    try {
      await this.tell({
        type: 'sight_start',
        callId: this.callId('phone_camera'),
        source: 'phone_camera',
        facing: chosen,
        label: cameraLabel(chosen),
      });
    } catch (error) {
      this.camera.close();
      throw error;
    }
    this.camera.stream(this.ports.mode() === 'live');
  }

  async startScreen(): Promise<void> {
    const granted = await this.screen.open(this.ports.mode() === 'live');
    if (!granted) {
      return;
    }
    try {
      await this.tell({
        type: 'sight_start',
        callId: this.callId('phone_screen'),
        source: 'phone_screen',
        label: 'Phone screen',
      });
    } catch (error) {
      this.screen.close();
      throw error;
    }
  }

  stop(source: SightSource, tell: boolean): void {
    const wasOn = source === 'phone_camera' ? this.camera.on : this.screen.on;
    if (source === 'phone_camera') {
      this.camera.close();
    } else if (source === 'phone_screen') {
      this.screen.close();
    } else {
      return;
    }
    const callId = this.ports.callId();
    if (tell && wasOn && callId !== null) {
      this.tell({ type: 'sight_stop', callId, source }).catch((error: unknown) => {
        this.ports.failure('The picture source could not be stopped on your home server', error);
      });
    }
  }

  release(): void {
    this.camera.discard();
    this.screen.discard();
  }

  flip(): void {
    if (!this.camera.on) {
      throw new SightStartError('phone_camera', 'failed', 'The camera is not on');
    }
    this.camera.flip();
  }

  pause(paused: boolean): void {
    if (this.camera.on) {
      this.camera.pause(paused);
    }
  }

  light(on: boolean): void {
    this.camera.light(on);
  }

  setMode(mode: SightMode): void {
    this.camera.stream(mode === 'live');
    this.screen.stream(mode === 'live');
  }

  async look(request: LookRequest): Promise<void> {
    if (request.source === 'phone_camera') {
      await this.lookCamera(request);
    } else if (request.source === 'phone_screen') {
      await this.lookScreen(request);
    } else {
      throw new SightStartError(request.source, 'unsupported', COMPUTER_ONLY);
    }
  }

  private async lookCamera(request: LookRequest): Promise<void> {
    const wasOn = this.camera.on;
    if (!wasOn) {
      const asked = SIGHT_FACING.safeParse(request.target);
      await this.camera.open(asked.success ? asked.data : this.ports.facing());
    }
    try {
      await this.camera.still(() =>
        this.announce('phone_camera', cameraLabel(this.camera.facingNow), request.lookId),
      );
    } finally {
      if (!wasOn) {
        this.camera.close();
      }
    }
  }

  private async lookScreen(request: LookRequest): Promise<void> {
    const wasOn = this.screen.on;
    if (!wasOn && !(await this.screen.open(false))) {
      throw new SightStartError('phone_screen', 'declined', SCREEN_DECLINED);
    }
    try {
      await this.announce('phone_screen', 'Phone screen', request.lookId);
      await this.screen.still();
    } finally {
      if (!wasOn) {
        this.screen.close();
      }
    }
  }

  private async announce(source: AppSightSource, label: string, lookId: string): Promise<void> {
    await this.tell({
      type: 'sight_still',
      callId: this.callId(source),
      source,
      label,
      lookId,
    });
  }

  private async tell(message: AssistantVoiceClientMessage): Promise<void> {
    await this.ports.send(message);
  }

  private callId(source: AppSightSource): string {
    const callId = this.ports.callId();
    if (callId === null) {
      throw new SightStartError(source, 'failed', 'There is no call to show things in');
    }
    return callId;
  }
}
