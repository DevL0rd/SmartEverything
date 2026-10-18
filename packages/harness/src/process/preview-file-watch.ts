import { watch, type FSWatcher } from 'chokidar';
import { readPreviewFile, type PreviewFileScope } from './preview-file-read';
import { background } from '@smarteverything/logging';

const CHANGE_SETTLE_MS = 50;
export interface PreviewFileUpdates {
  readonly validate: () => Promise<void>;
  readonly publish: (html: string) => Promise<void>;
  readonly failed: (cause: unknown) => void;
}
export class PreviewFileWatch {
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private reading = false;
  private dirty = false;
  constructor(
    private readonly file: PreviewFileScope,
    private html: string,
    private readonly updates: PreviewFileUpdates,
  ) {}
  start(): void {
    if (this.stopped || this.watcher !== null) return;
    this.watcher = watch(this.file.path, { persistent: false, ignoreInitial: true })
      .on('all', () => {
        this.changed();
      })
      .on('ready', () => {
        this.changed();
      })
      .on('error', (cause) => {
        this.fail(cause);
      });
  }
  private changed(): void {
    if (this.stopped) return;
    this.dirty = true;
    clearTimeout(this.timer ?? undefined);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh().catch((cause: unknown) => {
        this.fail(cause);
      });
    }, CHANGE_SETTLE_MS);
    this.timer.unref();
  }
  private async refresh(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      while (this.needsRefresh()) {
        this.dirty = false;
        await this.updates.validate();
        const html = await readPreviewFile(this.file);
        if (this.stopped || this.needsRefresh() || html === this.html) continue;
        await this.updates.publish(html);
        this.html = html;
      }
    } finally {
      this.reading = false;
    }
  }
  private needsRefresh(): boolean {
    return this.dirty && !this.stopped;
  }
  private fail(cause: unknown): void {
    if (this.stopped) return;
    this.stop();
    this.updates.failed(cause);
  }
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer ?? undefined);
    this.timer = null;
    background(this.watcher?.close(), 'watcher.close_failed');
    this.watcher = null;
  }
}
