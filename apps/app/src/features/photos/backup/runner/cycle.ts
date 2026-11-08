import type { PhotosBackupPref } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Ledger } from '../model/ledger';
import { freshRows, identityOf, lastModified, removedIds, unknownIds } from '../model/plan';
import { patchBackupStatus } from '../model/status';
import type { MediaRow, MediaScope, MediaStat } from '../model/types';
import { saveLedger } from './ledger-store';
import type { BackupPorts } from './ports';
import { uploadItem, type HashedItem } from './upload-item';

const log = new Logger('app.photos');

export type CycleEnd = 'complete' | 'interrupted' | 'stopped';

export function scopeOf(settings: PhotosBackupPref): MediaScope {
  return { albumIds: settings.albumIds, includeVideos: settings.includeVideos };
}

function abortion(signal: AbortSignal): Promise<'aborted'> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve('aborted');
      return;
    }
    signal.addEventListener('abort', () => {
      resolve('aborted');
    });
  });
}

interface PlannedPage {
  readonly ready: readonly Ready[];
  readonly modified: number;
  readonly pending: boolean;
}

interface Ready {
  readonly row: MediaRow;
  readonly stat: MediaStat;
}

export class BackupCycle {
  private readonly aborted: Promise<'aborted'>;
  private readonly unresolved = new Set<string>();
  private frozen = false;
  private total = 0;
  private done = 0;
  private failed = 0;
  private bytesLeft = 0;
  private lastFailure: string | null = null;
  private present: ReadonlySet<string> = new Set();

  constructor(
    private readonly ports: BackupPorts,
    private readonly ledger: Ledger,
    private readonly scope: MediaScope,
    private readonly signal: AbortSignal,
  ) {
    this.aborted = abortion(signal);
  }

  get failure(): string | null {
    return this.lastFailure;
  }

  async run(): Promise<CycleEnd> {
    this.publish('scanning', null);
    const present = await this.ports.media.listIds(this.scope, this.signal);
    if (this.interrupted()) return 'interrupted';
    this.present = present;
    this.ledger.forget(removedIds(present, this.ledger));
    await this.reconcileIdentities();
    if (this.interrupted()) return 'interrupted';
    const from = this.ledger.lastSeen;
    let plan = await this.scan(from);
    if (this.interrupted()) return 'interrupted';
    if (from > 0 && this.hasGap(present, plan)) {
      log.warn('backup.gap_found', { from });
      this.ledger.rewind();
      plan = await this.scan(0);
    }
    if (this.interrupted()) return 'interrupted';
    this.total = plan.reduce((sum, page) => sum + page.ready.length, 0);
    this.bytesLeft = plan.reduce(
      (sum, page) => sum + page.ready.reduce((bytes, item) => bytes + item.stat.bytes, 0),
      0,
    );
    const end = await this.transfer(plan);
    if (!this.interrupted()) await saveLedger(this.ports.storage, this.ledger);
    return end;
  }

  private async reconcileIdentities(): Promise<void> {
    const entries = this.ledger.uploaded().filter((entry) => entry.itemId === null);
    if (entries.length === 0) return;
    const answer = await this.ports.hub.checkHashes(
      {
        deviceId: this.ports.identity.deviceId,
        assets: entries.map((entry) => ({ localId: entry.localId, sha256: entry.sha256 })),
      },
      'lookup',
    );
    if (this.interrupted()) return;
    for (const entry of answer.have) this.ledger.identifyUploaded(entry.localId, entry.itemId);
  }

  private interrupted(): boolean {
    return this.signal.aborted;
  }

  private hasGap(present: ReadonlySet<string>, plan: readonly PlannedPage[]): boolean {
    const accounted = new Set(this.unresolved);
    for (const page of plan) {
      for (const item of page.ready) accounted.add(item.row.id);
    }
    return unknownIds(present, this.ledger, accounted).length > 0;
  }

  private async scan(from: number): Promise<readonly PlannedPage[]> {
    const plan: PlannedPage[] = [];
    const seen = new Set<string>();
    for await (const rows of this.ports.media.pagesFrom(this.scope, from, this.signal)) {
      if (this.interrupted()) break;
      const inScope = rows.filter((row) => {
        const identity = identityOf(row);
        if (!this.present.has(row.id) || seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      plan.push(await this.readyItems(freshRows(inScope, this.ledger), lastModified(rows)));
      if (this.interrupted()) break;
    }
    return plan;
  }

  private async transfer(plan: readonly PlannedPage[]): Promise<CycleEnd> {
    if (this.total > 0) this.publish('uploading', null);
    for (const page of plan) {
      if (this.interrupted()) return 'interrupted';
      const end = await this.page(page);
      if (end !== 'complete') return end;
    }
    return 'complete';
  }

  private async page(page: PlannedPage): Promise<CycleEnd> {
    this.frozen ||= page.pending;
    const failedBefore = this.failed;
    const hashed = await this.hashAll(page.ready);
    const end = await this.settle(hashed);
    if (this.failed === failedBefore && !this.frozen && end === 'complete') {
      this.ledger.advance(page.modified);
    } else {
      this.frozen = true;
    }
    if (!this.interrupted()) await saveLedger(this.ports.storage, this.ledger);
    return end;
  }

  private async readyItems(fresh: readonly MediaRow[], modified: number): Promise<PlannedPage> {
    if (fresh.length === 0) return { ready: [], modified, pending: false };
    const stats = new Map(
      (
        await this.ports.native.statMedia(
          fresh.map((row) => row.id),
          this.signal,
        )
      ).map((stat) => [stat.id, stat]),
    );
    let pending = false;
    const ready = fresh.flatMap((row) => {
      const stat = stats.get(row.id);
      if (stat === undefined || stat.isTrashed || stat.isPending) {
        this.unresolved.add(row.id);
        pending ||= stat?.isPending === true;
        return [];
      }
      return [{ row, stat }];
    });
    return { ready, modified, pending };
  }

  private publish(phase: 'scanning' | 'uploading', current: string | null): void {
    if (this.interrupted()) return;
    patchBackupStatus({
      phase,
      current,
      total: this.total,
      done: this.done,
      failed: this.failed,
      bytesLeft: this.bytesLeft,
    });
  }

  private async hashAll(ready: readonly Ready[]): Promise<readonly HashedItem[]> {
    const hashed: HashedItem[] = [];
    for (const { row, stat } of ready) {
      if (this.interrupted()) break;
      const sha256 = await this.hashOf(row, stat);
      if (sha256 !== null) hashed.push({ row, stat, sha256 });
    }
    return hashed;
  }

  private async hashOf(row: MediaRow, stat: MediaStat): Promise<string | null> {
    const cached = this.ledger.find(row.id);
    if (cached?.modificationTime === row.modificationTime) return cached.sha256;
    try {
      const result = await this.ports.native.hashFile(row.id, this.signal);
      if (result.bytes !== stat.bytes) throw new Error('the file changed while it was read');
      this.ledger.put({
        localId: row.id,
        sha256: result.sha256,
        bytes: result.bytes,
        modificationTime: row.modificationTime,
        uploadedAt: null,
        itemId: null,
      });
      return result.sha256;
    } catch (cause) {
      if (this.interrupted()) return null;
      this.fail(row, cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }

  private fail(row: MediaRow, reason: string): void {
    this.unresolved.add(row.id);
    this.failed += 1;
    this.lastFailure = reason;
    log.warn('backup.item_failed', { localId: row.id, reason });
    this.publish('uploading', null);
  }

  private async settle(items: readonly HashedItem[]): Promise<CycleEnd> {
    if (this.interrupted()) return 'interrupted';
    if (items.length === 0) return 'complete';
    const answer = await this.ports.hub.checkHashes(
      {
        deviceId: this.ports.identity.deviceId,
        assets: items.map((item) => ({ localId: item.row.id, sha256: item.sha256 })),
      },
      'backup',
    );
    if (this.interrupted()) return 'interrupted';
    const held = new Map(answer.have.map((entry) => [entry.localId, entry.itemId]));
    for (const item of items) {
      const itemId = held.get(item.row.id);
      if (itemId !== undefined) this.finish(item, itemId);
    }
    for (const item of items.filter((candidate) => !held.has(candidate.row.id))) {
      const end = await this.send(item);
      if (end !== 'complete') return end;
    }
    return this.interrupted() ? 'interrupted' : 'complete';
  }

  private finish(item: HashedItem, itemId: string): void {
    this.ledger.markUploaded(item.row.id, this.ports.now().toISOString(), itemId);
    this.done += 1;
    this.bytesLeft = Math.max(0, this.bytesLeft - item.stat.bytes);
    this.publish('uploading', null);
  }

  private async send(item: HashedItem): Promise<CycleEnd> {
    if (this.interrupted()) return 'interrupted';
    this.publish('uploading', item.row.filename);
    const end = await uploadItem(this.ports, item, this.aborted, this.signal);
    if (end.kind === 'interrupted') return 'interrupted';
    if (end.kind === 'uploaded') {
      this.finish(item, end.itemId);
      return 'complete';
    }
    this.fail(item.row, end.failure);
    return end.fatal ? 'stopped' : 'complete';
  }
}
