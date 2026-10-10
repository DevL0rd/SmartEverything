import { ValueStore } from '../../../design/external-store';
import {
  acquireSession,
  releaseSession,
  type SessionKey,
  type SharedSession,
} from './session-registry';

export interface LeaseState {
  readonly session: SharedSession | null;
  readonly suspended: boolean;
}

export class SessionLease {
  readonly current: ValueStore<LeaseState>;
  private held: SharedSession | null = null;
  private key: SessionKey | null = null;
  private wanted = false;
  private paused: boolean;
  private listening: boolean | null = null;
  private readonly player = Symbol('player');
  private readonly suspendListeners = new Set<() => void>();

  constructor(startPaused: boolean) {
    this.paused = startPaused;
    this.current = new ValueStore<LeaseState>({ session: null, suspended: startPaused });
  }

  want(key: SessionKey, wanted: boolean): void {
    const moved =
      this.key !== null && (this.key.deviceId !== key.deviceId || this.key.relay !== key.relay);
    this.key = key;
    this.wanted = wanted;
    if (moved) {
      this.letGo();
    }
    this.settle();
  }

  readonly suspend = (): void => {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.held?.setListening(this.player, null);
    this.bump();
    for (const listener of this.suspendListeners) {
      listener();
    }
    this.settle();
  };

  readonly resume = (): void => {
    if (!this.paused) {
      return;
    }
    this.paused = false;
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
    this.held.setListening(this.player, null);
    releaseSession(this.held);
    this.held = null;
    this.bump();
  }

  private settle(): void {
    if (this.wanted && !this.paused && this.key !== null) {
      if (this.held === null) {
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
