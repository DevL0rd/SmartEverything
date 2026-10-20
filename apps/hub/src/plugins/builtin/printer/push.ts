import { PrinterError } from '@smarteverything/domain';
import type { PrinterEvent } from '@smarteverything/ipp';
import type { PrinterClient } from './client';
import type { Notification } from './notification';

const RENEW_FRACTION = 0.8;
const MIN_WAIT_MS = 5_000;
const DEFAULT_WAIT_S = 15;
const RETRY_MS = 300_000;
const RESUBSCRIBE_MS = 0;

export interface PushDeps {
  readonly client: Pick<PrinterClient, 'subscribe' | 'renew' | 'unsubscribe' | 'notifications'>;
  readonly saved: () => { readonly id: number; readonly sequence: number | null } | null;
  readonly save: (
    subscription: { readonly id: number; readonly sequence: number | null } | null,
  ) => void;
  readonly changed: (events: readonly PrinterEvent[]) => void;
  readonly lapsed: () => void;
  readonly failed: (cause: unknown) => void;
  readonly signal: AbortSignal;
  readonly leaseSeconds: () => number;
}

export class PushChannel {
  #running = false;
  #renewTimer: NodeJS.Timeout | null = null;
  #retryTimer: NodeJS.Timeout | null = null;
  #lease = 0;

  constructor(private readonly deps: PushDeps) {}

  get active(): boolean {
    return this.#running;
  }

  async start(): Promise<boolean> {
    const outcome = await this.#subscribe();
    if (outcome === 'failed') this.#scheduleRetry(RETRY_MS);
    return outcome === 'started';
  }

  async #subscribe(): Promise<'started' | 'unsupported' | 'failed'> {
    if (this.#running) return 'started';
    try {
      const saved = this.deps.saved();
      const grant =
        saved === null
          ? await this.deps.client.subscribe()
          : { id: saved.id, leaseSeconds: this.deps.leaseSeconds() };
      if (grant === null) return 'unsupported';
      this.#lease = grant.leaseSeconds ?? this.deps.leaseSeconds();
      this.deps.save({ id: grant.id, sequence: saved?.sequence ?? null });
      this.#running = true;
      this.#scheduleRenew(grant.id);
      this.#listen(grant.id).catch((cause: unknown) => {
        this.#drop(cause);
      });
      return 'started';
    } catch (cause) {
      this.deps.save(null);
      this.deps.failed(cause);
      return 'failed';
    }
  }

  stop(): void {
    this.#running = false;
    if (this.#renewTimer !== null) clearTimeout(this.#renewTimer);
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#renewTimer = null;
    this.#retryTimer = null;
  }

  #scheduleRenew(id: number): void {
    if (this.#renewTimer !== null) clearTimeout(this.#renewTimer);
    this.#renewTimer = setTimeout(
      () => {
        this.deps.client.renew(id).then(
          () => {
            this.#scheduleRenew(id);
          },
          (cause: unknown) => {
            this.#drop(cause);
          },
        );
      },
      this.#lease * 1000 * RENEW_FRACTION,
    );
    this.#renewTimer.unref();
  }

  async #listen(id: number): Promise<void> {
    while (this.#running && !this.deps.signal.aborted) {
      const started = Date.now();
      const after = this.deps.saved()?.sequence ?? null;
      const notification: Notification = await this.deps.client.notifications(
        id,
        after,
        this.deps.signal,
      );
      if (notification.lapsed) {
        this.#drop(
          new PrinterError('unreachable', 'The printer no longer knows the push subscription.'),
          RESUBSCRIBE_MS,
        );
        return;
      }
      const last = notification.events.at(-1);
      if (last !== undefined) this.deps.save({ id, sequence: last.sequence });
      if (notification.events.length > 0) this.deps.changed(notification.events);
      const waited = Date.now() - started;
      const minimum = Math.max(
        MIN_WAIT_MS,
        (notification.intervalSeconds ?? DEFAULT_WAIT_S) * 1000,
      );
      if (waited < minimum) await this.#pause(minimum - waited);
    }
  }

  #pause(ms: number): Promise<void> {
    const { signal } = this.deps;
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      timer.unref();
      signal.addEventListener('abort', finish, { once: true });
    });
  }

  #drop(cause: unknown, retryMs = RETRY_MS): void {
    if (!this.#running) return;
    this.stop();
    if (this.deps.signal.aborted) return;
    this.deps.save(null);
    this.deps.failed(
      cause instanceof PrinterError
        ? cause
        : new PrinterError('unreachable', 'The push subscription ended.'),
    );
    this.deps.lapsed();
    this.#scheduleRetry(retryMs);
  }

  #scheduleRetry(ms: number): void {
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => {
      this.#subscribe().then(
        (outcome) => {
          if (outcome === 'failed') this.#scheduleRetry(RETRY_MS);
        },
        (retry: unknown) => {
          this.deps.failed(retry);
        },
      );
    }, ms);
    this.#retryTimer.unref();
  }
}
