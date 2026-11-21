import type { DesktopDriveFolderSyncing } from '@smarteverything/domain';
import type { PullProgress } from '../drive-sync/pull.js';
import type { SyncWaiting } from '../drive-sync/service.js';

export function bytesPerSecondOf(sentBytes: number, elapsedMs: number): number | null {
  return elapsedMs > 0 && sentBytes > 0 ? (sentBytes * 1000) / elapsedMs : null;
}

interface PullSeen {
  readonly done: number;
  readonly total: number;
}

export class FolderActivity {
  private readonly pulls = new Map<string, PullSeen>();
  private current: string | null = null;
  private sentFiles = 0;
  private sentBytes = 0;
  private pushLeft: number | null = null;
  private startedAt: number | null = null;

  constructor(
    private readonly placementId: string,
    private readonly name: string,
    private readonly now: () => number,
  ) {}

  pushed(relPath: string): void {
    this.begin();
    this.sentFiles += 1;
    this.current = relPath;
  }

  pulled(relPath: string): void {
    this.begin();
    const seen = this.pulls.get(relPath);
    if (seen !== undefined) {
      this.sentBytes += seen.total - seen.done;
      this.pulls.delete(relPath);
    }
    this.sentFiles += 1;
    this.current = relPath;
  }

  progress(progress: PullProgress): void {
    this.begin();
    const seen = this.pulls.get(progress.relPath);
    const before = seen === undefined ? progress.resumedBytes : seen.done;
    this.sentBytes += Math.max(0, progress.doneBytes - before);
    this.pulls.set(progress.relPath, { done: progress.doneBytes, total: progress.totalBytes });
    this.current = progress.relPath;
  }

  look(waiting: SyncWaiting): DesktopDriveFolderSyncing | null {
    if (this.pushLeft !== null && waiting.needBytes < this.pushLeft) {
      this.sentBytes += this.pushLeft - waiting.needBytes;
    }
    this.pushLeft = waiting.needBytes;
    let pullBytes = 0;
    for (const seen of this.pulls.values()) pullBytes += seen.total - seen.done;
    const files = waiting.pendingOps + this.pulls.size;
    if (files === 0) {
      this.sentFiles = 0;
      this.sentBytes = 0;
      this.current = null;
      this.startedAt = null;
      return null;
    }
    const now = this.now();
    const startedAt = (this.startedAt ??= now);
    return {
      placementId: this.placementId,
      name: this.name,
      files,
      bytes: waiting.needBytes + pullBytes,
      sentFiles: this.sentFiles,
      sentBytes: this.sentBytes,
      bytesPerSecond: bytesPerSecondOf(this.sentBytes, now - startedAt),
      current: this.current,
    };
  }

  private begin(): void {
    this.startedAt ??= this.now();
  }
}
