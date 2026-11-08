import {
  ApiError,
  VACUUM_VIDEO_TOPIC,
  type DeviceRow,
  type VacuumVideoOpening,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { Go2rtcError, type Go2rtcClient } from '../cameras/go2rtc-client';
import { listenOnly } from '../cameras/viewers';
import { deviceTarget } from '../metrics/viewers';
import { vacuumVideoSourceOf } from '../state/inventory';
import type { Store } from '../store/store';
import type { VacuumCommandIo } from './command-service';
import type { ViewerSource } from './viewer-demand';
import {
  VIDEO_PAGE,
  VacuumVideoAnswerError,
  enterVideoPage,
  readVideoStatus,
  switchVideo,
  verifyVideoPassword,
  type VacuumVideoStatus,
} from './video-gate';

export const UNLOCK_WINDOW_MS = 5 * 60 * 1000;

const HANDSHAKE_TIMEOUT = 'i/o timeout';

export type VacuumVideoClient = Pick<Go2rtcClient, 'putStream' | 'deleteStream' | 'answer'>;

export interface VacuumVideoPorts {
  readonly client: VacuumVideoClient;
  readonly blockingAddress: (deviceId: string) => string | null;
}

export interface VacuumVideoOptions extends VacuumVideoPorts {
  readonly devices: Pick<Store['devices'], 'byId'>;
  readonly viewers: ViewerSource;
  readonly io: (deviceId: string) => VacuumCommandIo | null;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface VacuumVideoRequest {
  readonly password?: string | undefined;
  readonly sdp: string;
}

interface Prior {
  readonly before: boolean;
  readonly live: boolean;
  readonly password: string | undefined;
}

interface Reach {
  readonly source: string;
  readonly io: VacuumCommandIo;
}

type Session =
  | { readonly phase: 'unlocking' }
  | { readonly phase: 'switched' | 'live'; readonly before: boolean };

export function vacuumVideoStream(deviceId: string): string {
  return `vacuum-video-${deviceId}`;
}

function isHandshakeTimeout(cause: unknown): boolean {
  return cause instanceof Go2rtcError && cause.message.includes(HANDSHAKE_TIMEOUT);
}

export class VacuumVideo {
  private readonly sessions = new Map<string, Session>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly options: VacuumVideoOptions) {}

  open(deviceId: string, request: VacuumVideoRequest): Promise<VacuumVideoOpening> {
    return this.queued(deviceId, async () => {
      const opening = await this.answerable(() => this.openNow(deviceId, request));
      this.options.log.info('vacuum_video.opened', { deviceId, status: opening.status });
      return opening;
    });
  }

  follow(deviceId: string): () => void {
    return this.options.viewers.follow(deviceTarget(deviceId), (demand) => {
      if (demand.topics.has(VACUUM_VIDEO_TOPIC)) return;
      background(this.close(deviceId), 'vacuum_video.close_failed', { deviceId });
    });
  }

  close(deviceId: string): Promise<void> {
    return this.queued(deviceId, async () => {
      if (this.held(deviceId)) {
        this.options.log.info('vacuum_video.close_deferred', { deviceId });
        return;
      }
      await this.closeNow(deviceId);
    });
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.keys()].map((deviceId) =>
        this.queued(deviceId, () => this.closeNow(deviceId)),
      ),
    );
  }

  private held(deviceId: string): boolean {
    return this.options.viewers.demand(deviceTarget(deviceId)).topics.has(VACUUM_VIDEO_TOPIC);
  }

  private async closeNow(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId);
    if (session === undefined) return;
    const { io } = this.reach(deviceId);
    if (session.phase === 'unlocking') {
      this.sessions.delete(deviceId);
      await enterVideoPage(io, VIDEO_PAGE.cancelUnlock);
    } else {
      await this.shut(deviceId, io);
    }
    this.options.log.info('vacuum_video.closed', { deviceId, phase: session.phase });
  }

  private queued<T>(deviceId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(deviceId) ?? Promise.resolve();
    const next = previous.then(run, run);
    this.queues.set(deviceId, next);
    return next;
  }

  private async answerable<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (cause) {
      if (cause instanceof VacuumVideoAnswerError) {
        throw new ApiError('upstream_failed', cause.message);
      }
      throw cause;
    }
  }

  private async openNow(
    deviceId: string,
    request: VacuumVideoRequest,
  ): Promise<VacuumVideoOpening> {
    if (!this.held(deviceId)) {
      throw new ApiError('conflict', 'Open the camera view of the robot before its video.');
    }
    const { source, io } = this.reach(deviceId);
    const status = await readVideoStatus(io);
    if (status.video_passwd_exist && request.password === undefined) {
      return { status: 'password_required' };
    }
    if (!status.physical_control_lock) return this.unlocking(deviceId, io);
    const prior = this.priorOf(deviceId, status, request);
    try {
      return await this.verified(deviceId, { source, io }, request, prior);
    } catch (cause) {
      if (!prior.live) await this.shutAfter(deviceId, io, cause);
      throw cause;
    }
  }

  private priorOf(deviceId: string, status: VacuumVideoStatus, request: VacuumVideoRequest): Prior {
    const current = this.sessions.get(deviceId);
    return {
      password: status.video_passwd_exist ? request.password : undefined,
      before:
        current === undefined || current.phase === 'unlocking'
          ? status.video_switch_status
          : current.before,
      live: current?.phase === 'live',
    };
  }

  private async unlocking(deviceId: string, io: VacuumCommandIo): Promise<VacuumVideoOpening> {
    await enterVideoPage(io, VIDEO_PAGE.unlock);
    this.sessions.set(deviceId, { phase: 'unlocking' });
    const until = new Date(this.options.now().getTime() + UNLOCK_WINDOW_MS);
    return { status: 'press_button', until: until.toISOString() };
  }

  private async verified(
    deviceId: string,
    reach: Reach,
    request: VacuumVideoRequest,
    prior: Prior,
  ): Promise<VacuumVideoOpening> {
    if (!prior.live) {
      this.sessions.set(deviceId, { phase: 'switched', before: prior.before });
      if (!prior.before) await switchVideo(reach.io, true);
    }
    if (prior.password !== undefined && !(await verifyVideoPassword(reach.io, prior.password))) {
      this.options.log.warn('vacuum_video.wrong_password', { deviceId });
      if (!prior.live) await this.shut(deviceId, reach.io);
      return { status: 'wrong_password' };
    }
    if (!prior.live) {
      this.sessions.set(deviceId, { phase: 'live', before: prior.before });
      await enterVideoPage(reach.io, VIDEO_PAGE.enter);
    }
    await this.options.client.putStream(vacuumVideoStream(deviceId), [reach.source]);
    return this.streamed(deviceId, reach.io, request.sdp, prior.live);
  }

  private async streamed(
    deviceId: string,
    io: VacuumCommandIo,
    sdp: string,
    shared: boolean,
  ): Promise<VacuumVideoOpening> {
    try {
      const answer = await this.options.client.answer(vacuumVideoStream(deviceId), listenOnly(sdp));
      return { status: 'live', sdp: answer };
    } catch (cause) {
      if (!isHandshakeTimeout(cause)) throw cause;
      if (!shared) await this.shut(deviceId, io);
      const address = this.options.blockingAddress(deviceId);
      return address === null ? { status: 'no_reply' } : { status: 'firewall_blocked', address };
    }
  }

  private async shutAfter(deviceId: string, io: VacuumCommandIo, cause: unknown): Promise<void> {
    try {
      await this.shut(deviceId, io);
    } catch (closing) {
      this.options.log.error('vacuum_video.close_failed', closing, {
        deviceId,
        opening: cause instanceof Error ? cause.name : typeof cause,
      });
    }
  }

  private async shut(deviceId: string, io: VacuumCommandIo): Promise<void> {
    const session = this.sessions.get(deviceId);
    this.sessions.delete(deviceId);
    if (session === undefined || session.phase === 'unlocking') return;
    try {
      if (session.phase === 'live') {
        await enterVideoPage(io, VIDEO_PAGE.exit);
        await this.options.client.deleteStream(vacuumVideoStream(deviceId));
      }
    } finally {
      if (!session.before) await switchVideo(io, false);
    }
  }

  private reach(deviceId: string): Reach {
    const device = this.vacuumOf(deviceId);
    const source = vacuumVideoSourceOf(device);
    if (source === null) {
      throw new ApiError(
        'conflict',
        `${device.name} has no LAN address, so its camera cannot stream.`,
      );
    }
    const io = this.options.io(deviceId);
    if (io === null) {
      throw new ApiError(
        'conflict',
        'The robot cannot be reached: the Xiaomi account is not running or the robot is offline.',
      );
    }
    return { source, io };
  }

  private vacuumOf(deviceId: string): DeviceRow {
    const device = this.options.devices.byId(deviceId);
    if (device.kind !== 'vacuum') {
      throw new ApiError('invalid_request', `${device.name} is not a robot vacuum.`);
    }
    return device;
  }
}
