import type { CameraQuality, IceServer } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ApiClient } from '../../../api/connection/client';
import { ValueStore } from '../../../design/external-store';
import type { MediaHandle, MediaLink, Transport } from './peer-types';
import {
  NO_VIDEO_AFTER_MS,
  type SessionError,
  type SessionPhase,
  type VideoFlow,
} from './player-state';
import {
  connectionTimedOut,
  linkAttached,
  phaseChanged,
  recoverSkipped,
  restartSkipped,
  retryScheduled,
  sessionStopping,
  videoFlow,
  videoMissing,
  type SessionTrace,
} from './session-log';
import { guarded, logFailure, startDirect, startRelay, type SessionHooks } from './session-start';
import { sampleOf, type StreamSample } from './stats';
import { surfaceReportsFrames } from './video-surface';
import { relaySupported } from './rtc';

const log = new Logger('app.camera-sessions');

const MEDIA_CONNECTION_LIMIT_MS = 10_000;

const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8000;
const RETRY_JITTER_MS = 400;

export interface SharedState {
  readonly phase: SessionPhase;
  readonly video: VideoFlow;
  readonly media: MediaHandle | null;
  readonly transport: Transport;
}

const IDLE: SharedState = {
  phase: { kind: 'idle' },
  video: 'waiting',
  media: null,
  transport: 'webrtc',
};

export interface SessionKey {
  readonly deviceId: string;
  readonly client: ApiClient;
  readonly iceServers: readonly IceServer[];
  readonly quality: CameraQuality;
}

function framesArrived(
  previous: StreamSample | null,
  current: StreamSample | null,
  requireProgress: boolean,
): boolean {
  const decoded = current?.framesDecoded ?? null;
  const baseline = previous?.framesDecoded ?? null;
  if (decoded === null) {
    return false;
  }
  return baseline === null ? !requireProgress && decoded > 0 : decoded > baseline;
}

export class SharedSession {
  readonly state = new ValueStore<SharedState>(IDLE);
  private link: MediaLink | null = null;
  private stopped = (): boolean => true;
  private watch: ReturnType<typeof setTimeout> | null = null;
  private videoWatch = 0;
  private users = 0;
  private retries = 0;
  private directRetried = false;
  private beganAt = 0;

  private trace(): SessionTrace {
    return {
      deviceId: this.key.deviceId,
      transport: this.state.get().transport,
      sinceBeganMs: Date.now() - this.beganAt,
    };
  }

  retryDelay(): number {
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.retries);
    this.retries += 1;
    const total = delay + Math.random() * RETRY_JITTER_MS;
    retryScheduled(this.key.deviceId, this.retries, Math.round(total));
    return total;
  }
  private leaving: ReturnType<typeof setTimeout> | null = null;

  cancelLeave(): void {
    if (this.leaving !== null) {
      clearTimeout(this.leaving);
      this.leaving = null;
    }
  }

  leaveAfter(ms: number, leave: () => void): void {
    this.cancelLeave();
    log.debug('camera.leave_scheduled', { deviceId: this.key.deviceId, graceMs: ms });
    this.leaving = setTimeout(() => {
      this.leaving = null;
      leave();
    }, ms);
  }

  hold(): number {
    this.users += 1;
    return this.users;
  }

  release(): number {
    this.users -= 1;
    return this.users;
  }

  held(): boolean {
    return this.users > 0;
  }

  constructor(public key: SessionKey) {}

  start(): void {
    this.directRetried = false;
    this.begin('webrtc');
  }

  private begin(transport: Transport): void {
    this.stop();
    this.beganAt = Date.now();
    log.info('camera.transport_begun', {
      deviceId: this.key.deviceId,
      transport,
      quality: this.key.quality,
      iceServers: this.key.iceServers.length,
      retries: this.retries,
    });
    let stopped = false;
    this.stopped = (): boolean => stopped;
    this.close = (): void => {
      stopped = true;
    };
    const hooks = guarded(this.hooks(), () => stopped);
    const { deviceId, iceServers, client, quality } = this.key;
    (transport === 'mse' ? startRelay : startDirect)(
      { deviceId, iceServers, client, quality },
      hooks,
    );
  }

  private hooks(): SessionHooks {
    return {
      active: (): boolean => !this.stopped(),
      report: (phase): void => {
        this.report(phase);
      },
      onMedia: (media): void => {
        this.applyListening();
        this.patch({ media });
      },
      onFlow: (flowing): void => {
        videoFlow(this.trace(), flowing);
        this.patch({ video: flowing ? 'flowing' : 'stalled' });
        if (flowing) {
          this.clearWatch();
        } else {
          this.watchVideo();
        }
      },
      onLink: (next, transport): void => {
        linkAttached(this.trace());
        this.link = next;
        this.applyListening();
        this.patch({ transport });
      },
    };
  }

  private report(phase: SessionPhase): void {
    phaseChanged(this.trace(), phase);
    if (phase.kind === 'failed') {
      logFailure(this.key.deviceId, phase.error);
      if (this.recover(phase.error)) {
        return;
      }
      this.clearWatch();
    }
    this.patch({ phase });
    if (phase.kind === 'connected') {
      this.retries = 0;
      this.watchVideo();
    } else if (phase.kind === 'starting' || phase.kind === 'interrupted') {
      this.clearWatch();
      this.watch = setTimeout(() => {
        this.watch = null;
        connectionTimedOut(this.trace(), phase.kind, MEDIA_CONNECTION_LIMIT_MS);
        this.report({ kind: 'failed', error: { kind: 'noPath' } });
      }, MEDIA_CONNECTION_LIMIT_MS);
    }
  }

  private recover(error: SessionError): boolean {
    const transport = this.state.get().transport;
    if (!['noPath', 'dropped', 'gathering'].includes(error.kind)) {
      recoverSkipped(this.key.deviceId, 'unrecoverable_error', error.kind);
      return false;
    }
    if (transport !== 'webrtc') {
      recoverSkipped(this.key.deviceId, 'already_on_relay', error.kind);
      return false;
    }
    if (relaySupported()) {
      log.info('camera.transport_fallback', { deviceId: this.key.deviceId, transport: 'mse' });
      this.begin('mse');
      return true;
    }
    if (this.directRetried) {
      recoverSkipped(this.key.deviceId, 'direct_already_retried', error.kind);
      return false;
    }
    log.info('camera.direct_retried', { deviceId: this.key.deviceId, error: error.kind });
    this.directRetried = true;
    this.begin('webrtc');
    return true;
  }

  private clearWatch(): void {
    this.videoWatch += 1;
    if (this.watch !== null) {
      clearTimeout(this.watch);
      this.watch = null;
    }
  }

  stop(): void {
    sessionStopping(this.key.deviceId, this.users, this.link !== null);
    this.close();
    this.clearWatch();
    this.link?.close();
    this.link = null;
    this.state.set(IDLE);
  }

  frameSeen(): void {
    this.patch({ video: 'flowing' });
    this.clearWatch();
  }

  stats(): Promise<unknown> {
    return this.link?.stats() ?? Promise.resolve(null);
  }

  private readonly listening = new Map<symbol, boolean>();

  setListening(player: symbol, listening: boolean | null): void {
    if (listening === null) {
      this.listening.delete(player);
    } else {
      this.listening.set(player, listening);
    }
    this.applyListening();
  }

  private applyListening(): void {
    this.link?.setListening([...this.listening.values()].some(Boolean));
  }

  private close: () => void = () => undefined;

  private patch(change: Partial<SharedState>): void {
    if (!this.stopped()) {
      this.state.update((current) => ({ ...current, ...change }));
    }
  }

  private videoMissing(): void {
    videoMissing(this.trace(), NO_VIDEO_AFTER_MS);
    if (!this.recover({ kind: 'noPath' })) {
      this.patch({ video: 'stalled' });
    }
  }

  private checkNativeVideo(
    previous: Promise<StreamSample | null>,
    requireProgress: boolean,
    active: () => boolean,
    watch: number,
  ): void {
    Promise.all([previous, this.stats().then(sampleOf)]).then(
      ([before, current]) => {
        if (active() || watch !== this.videoWatch) {
          return;
        }
        if (framesArrived(before, current, requireProgress)) {
          this.patch({ video: 'flowing' });
        } else {
          this.videoMissing();
        }
      },
      () => {
        if (!active() && watch === this.videoWatch) {
          this.videoMissing();
        }
      },
    );
  }

  private watchVideo(): void {
    this.clearWatch();
    const reports = surfaceReportsFrames();
    const active = this.stopped;
    const watch = this.videoWatch;
    const requireProgress = this.state.get().video === 'stalled';
    const previous =
      !reports && requireProgress ? this.stats().then(sampleOf, () => null) : Promise.resolve(null);
    if (!reports && !requireProgress) {
      this.patch({ video: 'flowing' });
    }
    this.watch = setTimeout(() => {
      this.watch = null;
      if (reports) {
        if (this.state.get().video !== 'flowing') {
          this.videoMissing();
        }
        return;
      }
      this.checkNativeVideo(previous, requireProgress, active, watch);
    }, NO_VIDEO_AFTER_MS);
  }
}

const sessions = new Map<string, SharedSession>();

function keyOf(key: SessionKey): string {
  return `${key.client.baseUrl}/${key.deviceId}/${key.quality}`;
}

export function acquireSession(key: SessionKey): SharedSession {
  const name = keyOf(key);
  const existing = sessions.get(name);
  const session = existing ?? new SharedSession(key);
  if (existing === undefined) {
    sessions.set(name, session);
  }
  session.cancelLeave();
  const state = session.state.get();
  const iceChanged = session.key.iceServers !== key.iceServers;
  session.key = key;
  const needsStart =
    existing === undefined ||
    iceChanged ||
    state.phase.kind === 'failed' ||
    state.video === 'stalled';
  const users = session.hold();
  if (users === 1 && needsStart) {
    log.info('camera.session_opened', {
      deviceId: key.deviceId,
      quality: key.quality,
      reused: existing !== undefined,
      iceChanged,
      previousPhase: state.phase.kind,
      previousVideo: state.video,
      sessions: sessions.size,
    });
    session.start();
  } else {
    log.debug('camera.session_joined', {
      deviceId: key.deviceId,
      users,
      needsStart,
      phase: state.phase.kind,
      video: state.video,
    });
  }
  return session;
}

const LEAVE_GRACE_MS = 10_000;

export function releaseSession(session: SharedSession): void {
  const remaining = session.release();
  log.debug('camera.session_released', { deviceId: session.key.deviceId, users: remaining });
  if (remaining > 0) {
    return;
  }
  session.leaveAfter(LEAVE_GRACE_MS, () => {
    if (session.held()) {
      return;
    }
    session.stop();
    sessions.delete(keyOf(session.key));
    log.info('camera.session_closed', {
      deviceId: session.key.deviceId,
      quality: session.key.quality,
      sessions: sessions.size,
    });
  });
}

export function restartSession(session: SharedSession): void {
  if (!session.held()) {
    restartSkipped(session.key.deviceId, 'not_held');
    return;
  }
  log.info('camera.restart_requested', { deviceId: session.key.deviceId });
  session.stop();
  setTimeout(() => {
    if (session.held()) {
      session.start();
    } else {
      restartSkipped(session.key.deviceId, 'released');
    }
  }, session.retryDelay());
}
