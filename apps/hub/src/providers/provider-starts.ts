import type { Provider, ProviderAdapter } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ProviderNotRunningError, ProviderStartFailedError } from '../commands/command-errors';

interface StartWaiter {
  readonly resolve: (adapter: ProviderAdapter) => void;
  readonly reject: (cause: Error) => void;
}

export type ProviderStartedListener = (provider: Provider, adapter: ProviderAdapter) => void;

class Starting {
  private readonly waiters = new Set<StartWaiter>();
  private launches = 0;

  wait(waiter: StartWaiter): void {
    this.waiters.add(waiter);
  }

  join(): void {
    this.launches += 1;
  }

  leave(): boolean {
    this.launches -= 1;
    return this.launches === 0;
  }

  shared(): boolean {
    return this.launches > 1;
  }

  settle(settle: (waiter: StartWaiter) => void): void {
    for (const waiter of this.waiters) settle(waiter);
    this.waiters.clear();
  }
}

export class ProviderStarts {
  private readonly starting = new Map<Provider, Starting>();
  private readonly listeners = new Set<ProviderStartedListener>();

  constructor(private readonly log: Logger) {}

  async track(
    provider: Provider,
    launch: () => Promise<number>,
    adapterOf: () => ProviderAdapter | undefined,
  ): Promise<number> {
    const starting = this.begin(provider);
    try {
      const deviceCount = await launch();
      const adapter = adapterOf();
      if (adapter === undefined) {
        throw new Error(`The ${provider} provider finished starting but is not running.`);
      }
      this.succeeded(provider, starting, adapter);
      return deviceCount;
    } catch (cause) {
      this.failed(provider, starting, cause);
      throw cause;
    } finally {
      this.end(provider, starting);
    }
  }

  wait(provider: Provider): Promise<ProviderAdapter> {
    const starting = this.starting.get(provider);
    if (starting === undefined) return Promise.reject(new ProviderNotRunningError(provider));
    return new Promise((resolve, reject) => {
      starting.wait({ resolve, reject });
    });
  }

  onStarted(listener: ProviderStartedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private begin(provider: Provider): Starting {
    const current = this.starting.get(provider);
    const starting = current ?? new Starting();
    starting.join();
    this.starting.set(provider, starting);
    return starting;
  }

  private end(provider: Provider, starting: Starting): void {
    if (starting.leave() && this.starting.get(provider) === starting) {
      this.starting.delete(provider);
    }
  }

  private succeeded(provider: Provider, starting: Starting, adapter: ProviderAdapter): void {
    starting.settle((waiter) => {
      waiter.resolve(adapter);
    });
    for (const listener of this.listeners) {
      try {
        listener(provider, adapter);
      } catch (cause) {
        this.log.error('provider.started_listener_failed', cause, { provider });
      }
    }
  }

  private failed(provider: Provider, starting: Starting, cause: unknown): void {
    if (starting.shared()) return;
    const failure = new ProviderStartFailedError(provider, cause);
    starting.settle((waiter) => {
      waiter.reject(failure);
    });
  }
}

const RETRY_FIRST_SECONDS = 5;

const RETRY_CAP_SECONDS = 60;

export class StartRetries {
  private readonly timers = new Map<Provider, NodeJS.Timeout>();

  constructor(private readonly log: Logger) {}

  schedule(provider: Provider, attempt: number, retry: () => void): void {
    const seconds = Math.min(RETRY_FIRST_SECONDS * 3 ** attempt, RETRY_CAP_SECONDS);
    this.log.info('provider.start_retry_scheduled', { provider, attempt, seconds });
    const timer = setTimeout(() => {
      this.timers.delete(provider);
      retry();
    }, seconds * 1000);
    timer.unref();
    this.timers.set(provider, timer);
  }

  cancel(provider: Provider): void {
    clearTimeout(this.timers.get(provider));
    this.timers.delete(provider);
  }

  cancelAll(): void {
    for (const provider of [...this.timers.keys()]) this.cancel(provider);
  }
}
