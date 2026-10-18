import { Logger } from '@smarteverything/logging';
import { ValueStore } from '../../../design/external-store';
import {
  acquireSession,
  releaseSession,
  type SessionKey,
  type SharedSession,
} from './session-registry';

const log = new Logger('app.camera-lease');

export type PauseReason = 'focus' | 'app';

export function startPausesOf(start: {
  readonly waitForFocus: boolean;
  readonly backgrounded: boolean;
}): readonly PauseReason[] {
  const reasons: PauseReason[] = [];
  if (start.waitForFocus) {
    reasons.push('focus');
  }
  if (start.backgrounded) {
    reasons.push('app');
  }
  return reasons;
}

export interface LeaseState {
  readonly session: SharedSession | null;
  readonly suspended: boolean;
}

export class SessionLease {
  readonly current: ValueStore<LeaseState>;
  private held: SharedSession | null = null;
  private key: SessionKey | null = null;
  private wanted = false;
  private readonly pauses = new Set<PauseReason>();
  private listening: boolean | null = null;
  private readonly player = Symbol('player');
  private readonly suspendListeners = new Set<() => void>();

  constructor(startPaused: readonly PauseReason[]) {
    for (const reason of startPaused) {
      this.pauses.add(reason);
    }
    this.current = new ValueStore<LeaseState>({ session: null, suspended: this.paused });
  }

  private get paused(): boolean {
    return this.pauses.size > 0;
  }

  want(key: SessionKey, wanted: boolean): void {
    const moved =
      this.key !== null &&
      (this.key.deviceId !== key.deviceId ||
        this.key.client !== key.client ||
        this.key.quality !== key.quality ||
        this.key.iceServers !== key.iceServers);
    this.key = key;
    this.wanted = wanted;
    if (moved) {
      log.debug('lease.moved', { deviceId: key.deviceId, quality: key.quality });
      this.letGo();
    }
    this.settle();
  }

  readonly suspend = (reason: PauseReason): void => {
    const was = this.paused;
    this.pauses.add(reason);
    if (was) {
      return;
    }
    log.info('lease.suspended', {
      deviceId: this.key?.deviceId ?? null,
      reason,
      held: this.held !== null,
    });
    this.held?.setListening(this.player, null);
    this.bump();
    for (const listener of this.suspendListeners) {
      listener();
    }
    this.settle();
  };

  readonly resume = (reason: PauseReason): void => {
    if (!this.pauses.delete(reason) || this.paused) {
      return;
    }
    log.info('lease.resumed', {
      deviceId: this.key?.deviceId ?? null,
      reason,
      wanted: this.wanted,
    });
    this.settle();
    this.bump();
  };

  listen(listening: boolean | null): void {
    this.listening = listening;
    this.held?.setListening(this.player, this.paused ? null : listening);
  }

  onSuspend(listener: () => void): () => void {
    this.suspendListeners.add(listener);
    return (): void => {
      this.suspendListeners.delete(listener);
    };
  }

  letGo(): void {
    if (this.held === null) {
      return;
    }
    log.debug('lease.released', { deviceId: this.held.key.deviceId });
    this.held.setListening(this.player, null);
    releaseSession(this.held);
    this.held = null;
    this.bump();
  }

  private settle(): void {
    if (this.wanted && !this.paused && this.key !== null) {
      if (this.held === null) {
        log.debug('lease.acquiring', { deviceId: this.key.deviceId, quality: this.key.quality });
        this.held = acquireSession(this.key);
        this.held.setListening(this.player, this.listening);
        this.bump();
      }
      return;
    }
    this.letGo();
  }

  private bump(): void {
    this.current.set({ session: this.held, suspended: this.paused });
  }
}
