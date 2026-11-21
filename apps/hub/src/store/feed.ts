import { EventEmitter } from 'node:events';
import {
  LIVE_NOTICE,
  ROW_CHANGE,
  type CommittedNotice,
  type DriveChangedNotice,
  type LiveChange,
  type RowChange,
} from '@smarteverything/domain';
import type { CommittedSpeech } from '../transcripts/speech';
import { QuietTotals } from './quiet-totals';
import type { Logger } from '@smarteverything/logging';

export type ChangeListener = (change: LiveChange) => void;

export type Unsubscribe = () => void;
export type CommitListener = () => void;
export type NoticeListener = (notice: CommittedNotice) => void;

interface FeedEvents {
  row: [change: LiveChange];
  notice: [notice: CommittedNotice];
  speech: [speech: CommittedSpeech];
  access: [];
  commit: [];
}

type Delivery = () => void;

interface HeldChange {
  readonly notice: DriveChangedNotice;
  superseded: boolean;
}

function union<T>(first: readonly T[], second: readonly T[]): readonly T[] {
  return [...new Set([...first, ...second])];
}

function mergedChange(first: DriveChangedNotice, second: DriveChangedNotice): DriveChangedNotice {
  return {
    type: 'drive_changed',
    rootIds: union(first.rootIds, second.rootIds),
    folderIds: union(first.folderIds, second.folderIds),
    albumIds: union(first.albumIds, second.albumIds),
    months: union(first.months, second.months),
    cursor: Math.max(first.cursor, second.cursor),
  };
}

function progressKeyOf(notice: CommittedNotice): string | null {
  if (notice.type === 'photos_ai') return `photos_ai:${notice.stage}`;
  if (notice.type === 'drive_progress') return `drive_progress:${notice.rootId}:${notice.phase}`;
  if (notice.type !== 'photos_progress') return null;
  return notice.itemId === undefined && notice.deviceId === undefined
    ? `photos_progress:${notice.kind}`
    : null;
}

export class ChangeFeed {
  private readonly emitter = new EventEmitter<FeedEvents>();
  private pending: Delivery[] | null = null;
  private heldChange: HeldChange | null = null;
  private readonly heldProgress = new Map<string, { superseded: boolean }>();
  private delivered = 0;
  private quiet: QuietTotals | null = null;
  private counts = { rows: 0, notices: 0, speech: 0, commits: 0, discards: 0, maxHeld: 0 };

  constructor(private readonly log: Logger) {
    this.emitter.setMaxListeners(0);
  }

  get seq(): number {
    return this.delivered;
  }

  drain(): {
    readonly rows: number;
    readonly notices: number;
    readonly speech: number;
    readonly commits: number;
    readonly discards: number;
    readonly maxHeld: number;
    readonly seq: number;
    readonly listeners: Readonly<Record<string, number>>;
  } {
    const drained = {
      ...this.counts,
      seq: this.delivered,
      listeners: {
        row: this.emitter.listenerCount('row'),
        notice: this.emitter.listenerCount('notice'),
        speech: this.emitter.listenerCount('speech'),
        commit: this.emitter.listenerCount('commit'),
      },
    };
    this.counts = { rows: 0, notices: 0, speech: 0, commits: 0, discards: 0, maxHeld: 0 };
    return drained;
  }

  subscribe(listener: ChangeListener): Unsubscribe {
    const guarded = this.guard('row', listener);
    this.emitter.on('row', guarded);
    this.log.debug('change.subscribed', () => ({
      event: 'row',
      listeners: this.emitter.listenerCount('row'),
    }));
    return (): void => {
      this.emitter.off('row', guarded);
      this.log.debug('change.unsubscribed', () => ({
        event: 'row',
        listeners: this.emitter.listenerCount('row'),
      }));
    };
  }

  subscribeNotices(listener: NoticeListener): Unsubscribe {
    const guarded = this.guard('notice', listener);
    this.emitter.on('notice', guarded);
    this.log.debug('change.subscribed', () => ({
      event: 'notice',
      listeners: this.emitter.listenerCount('notice'),
    }));
    return (): void => {
      this.emitter.off('notice', guarded);
      this.log.debug('change.unsubscribed', () => ({
        event: 'notice',
        listeners: this.emitter.listenerCount('notice'),
      }));
    };
  }

  subscribeSpeech(listener: (speech: CommittedSpeech) => void): Unsubscribe {
    const guarded = this.guard('speech', listener);
    this.emitter.on('speech', guarded);
    return (): void => {
      this.emitter.off('speech', guarded);
    };
  }

  subscribeAccess(listener: () => void): Unsubscribe {
    const guarded = this.guard('access', listener);
    this.emitter.on('access', guarded);
    return (): void => {
      this.emitter.off('access', guarded);
    };
  }

  subscribeCommitted(listener: CommitListener): Unsubscribe {
    const guarded = this.guard('commit', listener);
    this.emitter.on('commit', guarded);
    return (): void => {
      this.emitter.off('commit', guarded);
    };
  }

  notice(raw: unknown): void {
    const notice = LIVE_NOTICE.parse(raw);
    if (notice.type === 'drive_changed' && this.pending !== null) {
      this.holdChange(this.pending, notice);
      return;
    }
    const key = progressKeyOf(notice);
    if (key !== null && this.pending !== null) {
      this.holdProgress(this.pending, key, notice);
      return;
    }
    this.dispatch(() => {
      this.counts.notices += 1;
      this.emitter.emit('notice', notice);
    });
  }

  private holdProgress(pending: Delivery[], key: string, notice: CommittedNotice): void {
    const held = this.heldProgress.get(key);
    if (held !== undefined) held.superseded = true;
    const entry = { superseded: false };
    this.heldProgress.set(key, entry);
    pending.push(() => {
      if (entry.superseded) return;
      this.counts.notices += 1;
      this.emitter.emit('notice', notice);
    });
    this.counts.maxHeld = Math.max(this.counts.maxHeld, pending.length);
  }

  private holdChange(pending: Delivery[], notice: DriveChangedNotice): void {
    const held = this.heldChange;
    if (held !== null) held.superseded = true;
    const entry: HeldChange = {
      notice: held === null ? notice : mergedChange(held.notice, notice),
      superseded: false,
    };
    this.heldChange = entry;
    pending.push(() => {
      if (entry.superseded) return;
      this.counts.notices += 1;
      this.emitter.emit('notice', entry.notice);
    });
    this.counts.maxHeld = Math.max(this.counts.maxHeld, pending.length);
  }

  speech(speech: CommittedSpeech): void {
    this.dispatch(() => {
      this.counts.speech += 1;
      this.emitter.emit('speech', speech);
    });
  }

  accessChanged(): void {
    this.dispatch(() => {
      this.emitter.emit('access');
    });
  }

  committed(): void {
    this.counts.commits += 1;
    this.emitter.emit('commit');
  }

  afterCommit(work: () => void): void {
    this.dispatch(() => {
      queueMicrotask(work);
    });
  }

  quietTotals(quietMs: number): void {
    this.quiet = new QuietTotals(quietMs, (row) => {
      this.deliver(row);
    });
  }

  settleTotals(): void {
    this.quiet?.settleAll();
  }

  emit(change: unknown, onSequence?: (seq: number) => void): void {
    const row = ROW_CHANGE.parse(change);
    if (this.quiet !== null) {
      if (onSequence === undefined && this.quiet.hold(row)) return;
      this.quiet.settleFor(row);
    }
    this.deliver(row, onSequence);
  }

  private deliver(row: RowChange, onSequence?: (seq: number) => void): void {
    this.dispatch(() => {
      this.delivered += 1;
      this.counts.rows += 1;
      const live: LiveChange = { ...row, seq: this.delivered };
      try {
        onSequence?.(live.seq);
      } catch (cause) {
        this.log.error('change.sequence_listener_failed', cause, {
          table: live.table,
          operation: live.operation,
        });
      }
      this.emitter.emit('row', live);
    });
  }

  hold(): void {
    this.pending = [];
    this.heldChange = null;
    this.heldProgress.clear();
  }

  release(): void {
    const deliveries = this.pending ?? [];
    this.pending = null;
    this.heldChange = null;
    this.heldProgress.clear();
    for (const delivery of deliveries) delivery();
  }

  discard(): void {
    if (this.pending !== null && this.pending.length > 0) {
      this.counts.discards += 1;
      this.log.debug('change.discarded', { held: this.pending.length });
    }
    this.pending = null;
    this.heldChange = null;
    this.heldProgress.clear();
  }

  private dispatch(delivery: Delivery): void {
    if (this.pending === null) delivery();
    else {
      this.pending.push(delivery);
      this.counts.maxHeld = Math.max(this.counts.maxHeld, this.pending.length);
    }
  }

  private guard<Args extends unknown[]>(
    event: keyof FeedEvents,
    listener: (...args: Args) => void,
  ): (...args: Args) => void {
    return (...args) => {
      try {
        listener(...args);
      } catch (cause) {
        this.log.error('change.listener_failed', cause, { event });
      }
    };
  }
}
