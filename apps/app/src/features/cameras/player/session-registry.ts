import type { IceServer } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../../../design/external-store';
import type { MediaHandle, MediaLink, Transport } from './peer-types';
import { NO_VIDEO_AFTER_MS, type SessionPhase, type VideoFlow } from './player-state';
import { guarded, logFailure, startDirect, startRelay } from './session-start';
import { hasDecodedFrames } from './stats';
import { surfaceReportsFrames } from './video-surface';

const log = new Logger('app.camera-sessions');

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
  readonly relay: boolean;
  readonly iceServers: readonly IceServer[];
}

export class SharedSession {
  readonly state = new ValueStore<SharedState>(IDLE);
  private link: MediaLink | null = null;
  private stopped = (): boolean => true;
  private watch: ReturnType<typeof setTimeout> | null = null;
  private users = 0;
  private retries = 0;

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
    this.stop();
    let stopped = false;
    this.stopped = (): boolean => stopped;
    const hooks = guarded(
      {
        report: (phase) => {
          if (phase.kind === 'failed') {
            logFailure(this.key.deviceId, phase.error);
          }
          if (phase.kind === 'connected') {
            this.retries = 0;
          }
          this.patch({ phase });
          if (phase.kind === 'connected') {
            this.watchVideo();
          }
        },
        onMedia: (media) => {
          this.applyListening();
          this.patch({ media });
        },
        onFlow: (flowing) => {
          this.patch({ video: flowing ? 'flowing' : 'stalled' });
        },
        onLink: (next, transport) => {
          this.link?.close();
          this.link = next;
          this.patch({ transport });
        },
      },
      () => stopped,
    );
    const { deviceId, iceServers, relay } = this.key;
    (relay ? startRelay : startDirect)({ deviceId, iceServers }, hooks);
    this.close = (): void => {
      stopped = true;
    };
  }

  stop(): void {
    this.close();
    if (this.watch !== null) {
      clearTimeout(this.watch);
      this.watch = null;
    }
    this.link?.close();
    this.link = null;
    this.state.set(IDLE);
  }

  frameSeen(): void {
    this.patch({ video: 'flowing' });
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

  private watchVideo(): void {
    const reports = surfaceReportsFrames();
    if (!reports) {
      this.patch({ video: 'flowing' });
    }
    this.watch = setTimeout(() => {
      this.watch = null;
      if (reports) {
        if (this.state.get().video === 'waiting') {
          this.patch({ video: 'stalled' });
        }
        return;
      }
      this.stats().then(
        (report) => {
          this.patch({ video: hasDecodedFrames(report) ? 'flowing' : 'stalled' });
        },
        () => {
          this.patch({ video: 'stalled' });
        },
      );
    }, NO_VIDEO_AFTER_MS);
  }
}

const sessions = new Map<string, SharedSession>();

export const sessionsChanged = new ValueStore<number>(0);

export function peekSession(key: SessionKey): SharedSession | null {
  return sessions.get(keyOf(key)) ?? null;
}

function keyOf(key: SessionKey): string {
  return `${key.deviceId}/${key.relay ? 'server' : 'direct'}`;
}

export function acquireSession(key: SessionKey): SharedSession {
  const name = keyOf(key);
  const existing = sessions.get(name);
  const session = existing ?? new SharedSession(key);
  if (existing === undefined) {
    sessions.set(name, session);
  }
  session.cancelLeave();
  if (session.hold() === 1 && existing === undefined) {
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
