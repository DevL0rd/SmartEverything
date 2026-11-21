import { background } from '@smarteverything/logging';
import type { Store } from '../store/store';

type Checked<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: unknown };

async function checked<T>(check: () => Promise<T>): Promise<Checked<T>> {
  try {
    return { ok: true, value: await check() };
  } catch (failure) {
    return { ok: false, failure };
  }
}

export class LiveCheck<T> {
  private running = false;
  private again = false;
  private flight: Promise<void> = Promise.resolve();
  private readonly dispose: () => void;

  private constructor(
    store: Store,
    private readonly check: () => Promise<T>,
    private current: Checked<T>,
  ) {
    this.dispose = store.feed.subscribeCommitted(() => {
      this.revalidate();
    });
  }

  static async start<T>(store: Store, check: () => Promise<T>): Promise<LiveCheck<T>> {
    return new LiveCheck(store, check, await checked(check));
  }

  value(): T {
    if (!this.current.ok) throw this.current.failure;
    return this.current.value;
  }

  async idle(): Promise<void> {
    while (this.running) await this.flight;
  }

  stop(): void {
    this.dispose();
  }

  private revalidate(): void {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.flight = this.rechecked();
    background(this.flight, 'live_check.failed');
  }

  private async rechecked(): Promise<void> {
    this.settled(await checked(this.check));
  }

  private settled(result: Checked<T>): void {
    this.current = result;
    this.running = false;
    if (!this.again) return;
    this.again = false;
    this.revalidate();
  }
}

export async function withLiveCheck<T, R>(
  store: Store,
  check: () => Promise<T>,
  work: (live: LiveCheck<T>) => Promise<R>,
): Promise<R> {
  const live = await LiveCheck.start(store, check);
  try {
    return await work(live);
  } finally {
    live.stop();
  }
}
