import type { SightFacing } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Camera } from 'expo-camera';
import {
  sendAssistantCallFrame,
  setAssistantCallCamera,
  type NativeFrameSampling,
} from '../../../../../../modules/health-connect';
import { rawErrorText } from '../../../../../format/errors';
import { changeVideo } from '../../call-state';
import { SightStartError } from '../sight-failure';
import { cameraSurfaces } from './camera-surface';
import { FrameLoop } from './frame-loop';

const log = new Logger('app.assistant-call');

const READY_MS = 6000;

const DENIED = 'Allow the camera for SmartEverything in your phone’s settings.';

const IN_USE = 'Another app is using the camera.';

export interface CameraPorts {
  readonly sampling: () => NativeFrameSampling;
  readonly streaming: () => boolean;
  readonly failure: (problem: string, error: unknown) => void;
}

export class NativeCamera {
  private opened = false;
  private paused = false;
  private loop: FrameLoop | null = null;
  private facing: SightFacing = 'back';

  constructor(private readonly ports: CameraPorts) {}

  get on(): boolean {
    return this.opened;
  }

  get facingNow(): SightFacing {
    return this.facing;
  }

  async open(facing: SightFacing): Promise<void> {
    const permission = await Camera.requestCameraPermissionsAsync();
    if (!permission.granted) {
      changeVideo(() => ({ camera: 'denied', facing }));
      throw new SightStartError('phone_camera', 'denied', DENIED);
    }
    this.facing = facing;
    changeVideo(() => ({ camera: 'starting', facing }));
    try {
      await setAssistantCallCamera(true);
    } catch (error) {
      changeVideo(() => ({ camera: 'off' }));
      throw new SightStartError('phone_camera', 'failed', rawErrorText(error));
    }
    changeVideo(() => ({ camera: 'on' }));
    try {
      await cameraSurfaces.ready(READY_MS);
    } catch (error) {
      log.warn('call.camera_not_ready', { reason: rawErrorText(error) });
      this.release();
      changeVideo(() => ({ camera: 'busy' }));
      throw new SightStartError('phone_camera', 'busy', IN_USE);
    }
    this.opened = true;
  }

  close(): void {
    this.discard();
    changeVideo(() => ({ camera: 'off', light: false }));
    this.release();
  }

  discard(): void {
    this.loop?.stop();
    this.loop = null;
    this.opened = false;
    this.paused = false;
  }

  stream(live: boolean): void {
    if (!this.opened) {
      return;
    }
    this.loop ??= new FrameLoop({
      intervalMs: (): number => this.ports.sampling().minIntervalMs,
      step: (): Promise<void> => this.step(),
      failure: (error: unknown): void => {
        this.ports.failure('The camera stopped working', error);
      },
    });
    if (live && !this.paused) {
      this.loop.start();
    } else {
      this.loop.stop();
    }
  }

  pause(paused: boolean): void {
    this.paused = paused;
    changeVideo(() => ({ camera: paused ? 'paused' : 'on' }));
    this.stream(this.ports.streaming());
  }

  flip(): void {
    this.facing = this.facing === 'front' ? 'back' : 'front';
    changeVideo(() => ({ facing: this.facing, light: false }));
  }

  light(on: boolean): void {
    changeVideo(() => ({ light: on }));
  }

  async still(announce: () => Promise<void>): Promise<void> {
    const surface = await cameraSurfaces.ready(READY_MS);
    const uri = await surface.capture();
    await announce();
    const sent = await sendAssistantCallFrame(uri, { ...this.ports.sampling(), live: false }, true);
    if (!sent) {
      throw new SightStartError(
        'phone_camera',
        'failed',
        'The picture did not reach your home server',
      );
    }
  }

  private async step(): Promise<void> {
    const surface = cameraSurfaces.current;
    if (!this.ports.streaming() || surface === null) {
      return;
    }
    await sendAssistantCallFrame(await surface.capture(), this.ports.sampling(), false);
  }

  private release(): void {
    setAssistantCallCamera(false).catch((error: unknown) => {
      log.warn('call.camera_release_failed', { reason: rawErrorText(error) });
    });
  }
}
