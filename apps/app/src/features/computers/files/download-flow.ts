import type { FileEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { PreparedDownload } from '../../../api/computer-downloads';
import { ValueStore } from '../../../design/external-store';

export type DownloadTarget = Pick<FileEntry, 'path' | 'name' | 'kind'>;

export type DownloadIntent = 'save' | 'open' | 'share';

export type DownloadOutcome = 'completed' | 'cancelled' | 'external';

export type DownloadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly targets: readonly DownloadTarget[] }
  | {
      readonly kind: 'ready';
      readonly targets: readonly DownloadTarget[];
      readonly prepared: PreparedDownload;
    }
  | {
      readonly kind: 'working';
      readonly targets: readonly DownloadTarget[];
      readonly prepared: PreparedDownload;
      readonly intent: DownloadIntent;
    }
  | {
      readonly kind: 'done';
      readonly targets: readonly DownloadTarget[];
      readonly prepared: PreparedDownload;
      readonly intent: DownloadIntent;
      readonly outcome: DownloadOutcome;
    }
  | {
      readonly kind: 'failed';
      readonly targets: readonly DownloadTarget[];
      readonly error: unknown;
    };

export interface DownloadDeps {
  readonly prepare: (paths: readonly string[]) => Promise<PreparedDownload>;
  readonly perform: (
    intent: DownloadIntent,
    prepared: PreparedDownload,
  ) => Promise<DownloadOutcome>;
  readonly abort: (prepared: PreparedDownload) => Promise<void>;
}

export class DownloadFlow {
  readonly state = new ValueStore<DownloadState>({ kind: 'idle' });
  private generation = 0;
  private cancels = 0;
  private readonly spent = new Set<string>();

  constructor(private readonly deps: DownloadDeps) {}

  readonly start = (targets: readonly DownloadTarget[]): void => {
    this.generation += 1;
    this.spent.clear();
    this.state.set({ kind: 'preparing', targets });
    background(this.prepareFor(targets, this.generation), 'files.download_prepare_failed');
  };

  private async prepareFor(targets: readonly DownloadTarget[], generation: number): Promise<void> {
    try {
      const prepared = await this.deps.prepare(targets.map((target) => target.path));
      if (generation === this.generation) this.state.set({ kind: 'ready', targets, prepared });
    } catch (error) {
      if (generation === this.generation) this.state.set({ kind: 'failed', targets, error });
    }
  }

  async run(intent: DownloadIntent): Promise<void> {
    const current = this.state.get();
    if (current.kind !== 'ready' && current.kind !== 'done') return;
    const { targets } = current;
    const generation = this.generation;
    const cancels = this.cancels;
    try {
      const prepared = await this.fresh(current.prepared, targets);
      if (generation !== this.generation) return;
      this.state.set({ kind: 'working', targets, prepared, intent });
      this.spent.add(prepared.url);
      const outcome = await this.deps.perform(intent, prepared);
      if (generation !== this.generation) return;
      this.state.set(
        outcome === 'cancelled'
          ? { kind: 'ready', targets, prepared }
          : { kind: 'done', targets, prepared, intent, outcome },
      );
    } catch (error) {
      if (generation !== this.generation) return;
      if (this.cancels !== cancels) {
        this.state.set(current);
        return;
      }
      this.state.set({ kind: 'failed', targets, error });
    }
  }

  async cancel(): Promise<void> {
    const current = this.state.get();
    if (current.kind !== 'working') return;
    this.cancels += 1;
    await this.deps.abort(current.prepared);
  }

  close(): void {
    this.generation += 1;
    const current = this.state.get();
    this.state.set({ kind: 'idle' });
    if (current.kind === 'working') {
      background(this.deps.abort(current.prepared), 'files.download_abort_failed');
    }
  }

  private async fresh(
    prepared: PreparedDownload,
    targets: readonly DownloadTarget[],
  ): Promise<PreparedDownload> {
    if (prepared.download.kind === 'zip' && this.spent.has(prepared.url)) {
      return this.deps.prepare(targets.map((target) => target.path));
    }
    return prepared;
  }
}
