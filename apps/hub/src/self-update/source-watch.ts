import { watch } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.self-update');
const CHECKOUT_REFERENCES: ReadonlySet<string> = new Set([
  'HEAD',
  'FETCH_HEAD',
  'ORIG_HEAD',
  'packed-refs',
]);

interface SourceWatchOptions {
  readonly probe: (signal: AbortSignal) => Promise<string>;
  readonly changed: (signal: AbortSignal) => Promise<void>;
  readonly events?: (refresh: () => void) => () => void;
}

export interface SourceWatch {
  readonly refresh: () => void;
  readonly stop: () => Promise<void>;
}

export function watchSourceCheckout(root: string, refresh: () => void): () => void {
  const watcher = watch(join(root, '.git'), (_event, name) => {
    if (name !== null && CHECKOUT_REFERENCES.has(name)) refresh();
  });
  watcher.on('error', (cause) => {
    log.error('update_source.watch_failed', cause);
  });
  return () => {
    watcher.close();
  };
}

class SourceTipWatch {
  private announcedTip: string | null | undefined;
  private failedTip: string | null | undefined;
  private running = false;
  private queued = false;
  private pending = Promise.resolve();
  private readonly controller = new AbortController();

  constructor(private readonly options: Pick<SourceWatchOptions, 'probe' | 'changed'>) {}

  private aborted(): boolean {
    return this.controller.signal.aborted;
  }

  private async readTip(): Promise<string | null> {
    try {
      return await this.options.probe(this.controller.signal);
    } catch (cause) {
      if (!this.aborted()) log.error('update_source.probe_failed', cause);
      return null;
    }
  }

  private async check(): Promise<void> {
    const tip = await this.readTip();
    const unchanged =
      tip === this.announcedTip || (tip === null && this.announcedTip === undefined);
    if (this.aborted() || unchanged || (this.failedTip !== undefined && tip === this.failedTip))
      return;
    try {
      await this.options.changed(this.controller.signal);
      this.announcedTip = tip;
      this.failedTip = undefined;
    } catch (cause) {
      this.failedTip = tip;
      if (!this.aborted()) log.error('update_source.notice_failed', cause, { tip });
    }
  }

  private takeQueued(): boolean {
    const queued = this.queued;
    this.queued = false;
    return queued && !this.aborted();
  }

  private async drain(): Promise<void> {
    do {
      await this.check();
    } while (this.takeQueued());
    this.running = false;
  }

  readonly refresh = (): void => {
    if (this.aborted()) return;
    if (this.running) {
      this.queued = true;
      return;
    }
    this.running = true;
    this.pending = this.drain();
  };

  async stop(): Promise<void> {
    this.controller.abort();
    await this.pending;
  }
}

export function watchHubUpdateSource({ probe, changed, events }: SourceWatchOptions): SourceWatch {
  const source = new SourceTipWatch({ probe, changed });
  const unsubscribe = events?.(source.refresh);
  source.refresh();
  return {
    refresh: source.refresh,
    stop: async (): Promise<void> => {
      unsubscribe?.();
      await source.stop();
    },
  };
}
