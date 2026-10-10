import { Logger } from '@smarteverything/logging';
import { Backoff } from '../backoff';
import { ChildCrashedError, ChildUnavailableError, type Frame } from './frames';
import type { ChildHandle, ChildSpawner } from './spawn';

const IDLE_MS = 30_000;

export interface ChildHostOptions {
  readonly kind: string;
  readonly spawn: ChildSpawner;
  readonly log?: Logger;
  readonly idleMs?: number;
  readonly now?: () => number;
}

export interface ChildCrash {
  readonly signal: string | null;
  readonly code: number | null;
  readonly pid: number | undefined;
  readonly restartInMs: number;
  readonly error: ChildCrashedError;
}

interface Pending {
  readonly resolve: (payload: unknown) => void;
  readonly reject: (cause: unknown) => void;
  readonly timer: NodeJS.Timeout;
}

type EventListener = (name: string, payload: unknown) => void;

export class ChildHost {
  private current: ChildHandle | null = null;
  private readonly retired = new WeakSet<ChildHandle>();
  private readonly pending = new Map<number, Pending>();
  private readonly events: EventListener[] = [];
  private readonly crashes: ((crash: ChildCrash) => void)[] = [];
  private readonly holds = new Set<symbol>();
  private readonly backoff = new Backoff();
  private readonly log: Logger;
  private readonly now: () => number;
  private restartAt: number | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private lastNumber = 0;
  private restarts = 0;

  constructor(private readonly options: ChildHostOptions) {
    this.log = options.log ?? new Logger('hub.plugins');
    this.now = options.now ?? Date.now;
  }

  get running(): boolean {
    return this.current !== null;
  }

  onEvent(listener: EventListener): void {
    this.events.push(listener);
  }

  onCrash(listener: (crash: ChildCrash) => void): void {
    this.crashes.push(listener);
  }

  hold(): () => void {
    const token = Symbol('hold');
    this.holds.add(token);
    this.clearIdle();
    return (): void => {
      if (this.holds.delete(token)) {
        this.armIdle();
      }
    };
  }

  call(name: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    const child = this.ensure();
    this.lastNumber += 1;
    const id = this.lastNumber;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ChildUnavailableError(this.options.kind, `${name} did not answer in time`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (!child.send({ kind: 'call', id, name, payload })) {
        this.settle(id, new ChildUnavailableError(this.options.kind, 'its channel is closed'));
      }
    });
  }

  send(name: string, payload: unknown): boolean {
    return this.current?.send({ kind: 'event', name, payload }) ?? false;
  }

  retire(): void {
    this.clearRestart();
    this.clearIdle();
    const child = this.current;
    if (child !== null) {
      this.retired.add(child);
      this.current = null;
      child.kill();
      this.rejectAll(new ChildUnavailableError(this.options.kind, 'it was stopped'));
    }
  }

  private ensure(): ChildHandle {
    if (this.current !== null) {
      return this.current;
    }
    if (this.restartAt !== null) {
      const seconds = Math.max(1, Math.ceil((this.restartAt - this.now()) / 1000));
      throw new ChildUnavailableError(
        this.options.kind,
        `it is restarting after a crash (about ${String(seconds)} s)`,
      );
    }
    return this.start();
  }

  private start(): ChildHandle {
    const child = this.options.spawn();
    this.current = child;
    this.backoff.started(this.now());
    child.onFrame((frame) => {
      this.received(frame);
    });
    child.onInvalid((error) => {
      this.log.warn('plugin.child_frame_invalid', {
        kind: this.options.kind,
        reason: error.message,
      });
    });
    child.onExit((code, signal) => {
      this.exited(child, code, signal);
    });
    if (this.holds.size === 0) {
      this.armIdle();
    }
    return child;
  }

  private received(frame: Frame): void {
    if (frame.kind === 'event') {
      this.events.forEach((listener) => {
        listener(frame.name, frame.payload);
      });
    } else if (frame.kind === 'reply') {
      this.settle(
        frame.id,
        frame.ok ? undefined : new Error(frame.error ?? 'The call failed'),
        frame.payload,
      );
    }
  }

  private settle(id: number, failure: unknown, payload?: unknown): void {
    const entry = this.pending.get(id);
    if (entry === undefined) {
      return;
    }
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (failure === undefined) {
      entry.resolve(payload);
    } else {
      entry.reject(failure);
    }
  }

  private rejectAll(cause: unknown): void {
    [...this.pending.keys()].forEach((id) => {
      this.settle(id, cause);
    });
  }

  private exited(child: ChildHandle, code: number | null, signal: string | null): void {
    if (this.retired.has(child) || this.current !== child) {
      return;
    }
    this.current = null;
    this.clearIdle();
    const error = new ChildCrashedError(this.options.kind, signal, code);
    const delay = this.backoff.nextDelay(this.now());
    this.restartAt = this.now() + delay;
    this.log.error(`plugin.${this.options.kind}_process_crashed`, error, {
      signal,
      exitCode: code,
      pid: child.pid,
      restartInMs: delay,
    });
    this.rejectAll(error);
    this.restartTimer = setTimeout(() => {
      this.restart();
    }, delay);
    this.restartTimer.unref();
    this.crashes.forEach((listener) => {
      listener({ signal, code, pid: child.pid, restartInMs: delay, error });
    });
  }

  private restart(): void {
    this.restartTimer = null;
    this.restartAt = null;
    this.restarts += 1;
    try {
      const child = this.start();
      this.log.info(`plugin.${this.options.kind}_process_restarted`, {
        pid: child.pid,
        restarts: this.restarts,
      });
    } catch (cause) {
      this.log.error(`plugin.${this.options.kind}_process_restart_failed`, cause);
    }
  }

  private armIdle(): void {
    this.clearIdle();
    if (this.current === null || this.holds.size > 0) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.retire();
    }, this.options.idleMs ?? IDLE_MS);
    this.idleTimer.unref();
  }

  private clearIdle(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartAt = null;
  }
}
