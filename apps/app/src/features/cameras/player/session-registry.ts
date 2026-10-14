import type { IceServer } from '@smarteverything/domain';
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

  retryDelay(): number {
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.retries);
    this.retries += 1;
    return delay + Math.random() * RETRY_JITTER_MS;
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

  constructor(readonly key: SessionKey) {}

  start(): void {
    this.directRetried = false;
    this.begin('webrtc');
  }

  private begin(transport: Transport): void {
    this.stop();
    let stopped = false;
    this.stopped = (): boolean => stopped;
    this.close = (): void => {
      stopped = true;
    };
    const hooks = guarded(this.hooks(), () => stopped);
    const { deviceId, iceServers, client } = this.key;
    (transport === 'mse' ? startRelay : startDirect)({ deviceId, iceServers, client }, hooks);
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
        this.patch({ video: flowing ? 'flowing' : 'stalled' });
        if (flowing) {
          this.clearWatch();
        } else {
          this.watchVideo();
        }
      },
      onLink: (next, transport): void => {
        this.link = next;
        this.applyListening();
        this.patch({ transport });
      },
    };
  }

  private report(phase: SessionPhase): void {
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
        this.report({ kind: 'failed', error: { kind: 'noPath' } });
      }, MEDIA_CONNECTION_LIMIT_MS);
    }
  }

  private recover(error: SessionError): boolean {
    if (!['noPath', 'dropped', 'gathering'].includes(error.kind)) {
      return false;
    }
    if (this.state.get().transport !== 'webrtc') {
      return false;
    }
    if (relaySupported()) {
      log.info('camera.transport_fallback', { deviceId: this.key.deviceId, transport: 'mse' });
      this.begin('mse');
      return true;
    }
    if (this.directRetried) {
      return false;
    }
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

export const sessionsChanged = new ValueStore<number>(0);

export function peekSession(key: SessionKey): SharedSession | null {
  return sessions.get(keyOf(key)) ?? null;
}

const clients = new WeakMap<ApiClient, number>();
let nextClient = 0;

function keyOf(key: SessionKey): string {
  let identity = clients.get(key.client);
  if (identity === undefined) {
    identity = nextClient;
    nextClient += 1;
    clients.set(key.client, identity);
  }
  return `${String(identity)}/${key.deviceId}/${JSON.stringify(key.iceServers)}`;
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
  const needsStart =
    existing === undefined || state.phase.kind === 'failed' || state.video === 'stalled';
  if (session.hold() === 1 && needsStart) {
    log.info('camera.session_opened', { deviceId: key.deviceId });
    session.start();
    sessionsChanged.update((version) => version + 1);
  }
  return session;
}

const LEAVE_GRACE_MS = 10_000;

export function releaseSession(session: SharedSession): void {
  if (session.release() > 0) {
    return;
  }
  session.leaveAfter(LEAVE_GRACE_MS, () => {
    if (session.held()) {
      return;
    }
    session.stop();
    sessions.delete(keyOf(session.key));
    sessionsChanged.update((version) => version + 1);
    log.info('camera.session_closed', { deviceId: session.key.deviceId });
  });
}

export function restartSession(session: SharedSession): void {
  if (!session.held()) {
    return;
  }
  session.stop();
  setTimeout(() => {
    if (session.held()) {
      session.start();
    }
  }, session.retryDelay());
}
