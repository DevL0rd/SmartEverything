import { realpathSync, statSync, watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import { HarnessRuntimeError } from '../host/errors';
import { readPreviewFile, type PreviewFileScope } from './preview-file-read';

const CHANGE_SETTLE_MS = 50;
export interface PreviewFileUpdates {
  readonly validate: () => Promise<void>;
  readonly publish: (html: string) => Promise<void>;
  readonly failed: (cause: unknown) => void;
}
export class PreviewFileWatch {
  private watcher: FSWatcher | null = null;
  private parentIdentity: { readonly device: number; readonly inode: number } | null = null;
  private workspaceWatcher: FSWatcher | null = null;
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
    this.bindParent();
    this.workspaceWatcher = watch(
      dirname(this.file.workspace),
      { persistent: false },
      (_event, filename) => {
        if (filename === null || filename === basename(this.file.workspace)) this.changed();
      },
    );
    this.workspaceWatcher.on('error', (cause) => {
      this.fail(cause);
    });
    this.changed();
  }
  private bindParent(): void {
    const identity = statSync(this.file.parent);
    if (realpathSync(this.file.parent) !== this.file.parent || !identity.isDirectory())
      throw new HarnessRuntimeError('ownership_lost', 'The HTML parent is not canonical.');
    if (this.parentIdentity?.device === identity.dev && this.parentIdentity.inode === identity.ino)
      return;
    const watcher = watch(this.file.parent, { persistent: false }, (_event, filename) => {
      if (
        filename !== null &&
        filename !== basename(this.file.path) &&
        filename !== basename(this.file.parent)
      )
        return;
      this.changed();
    });
    this.watcher?.close();
    this.watcher = watcher;
    const opened = statSync(this.file.parent);
    if (opened.dev !== identity.dev || opened.ino !== identity.ino) {
      watcher.close();
      throw new HarnessRuntimeError(
        'ownership_lost',
        'The HTML parent changed during watch setup.',
      );
    }
    this.parentIdentity = { device: opened.dev, inode: opened.ino };
    this.dirty = true;
    watcher.on('error', (cause) => {
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
    if (this.reading || this.stopped) return;
    this.reading = true;
    try {
      while (this.needsRefresh()) {
        this.dirty = false;
        await this.updates.validate();
        if (!this.active()) return;
        this.bindParent();
        this.dirty = false;
        const html = await readPreviewFile(this.file);
        await this.updates.validate();
        if (this.active()) this.bindParent();
        if (!this.active() || this.needsRefresh() || html === this.html) continue;
        await this.updates.publish(html);
        this.html = html;
      }
    } finally {
      this.reading = false;
    }
  }
  private active(): boolean {
    return !this.stopped;
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
    this.watcher?.close();
    this.watcher = null;
    this.workspaceWatcher?.close();
    this.workspaceWatcher = null;
  }
}
