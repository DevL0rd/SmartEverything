import { EventEmitter } from 'node:events';
import {
  LIVE_NOTICE,
  ROW_CHANGE,
  type CommittedNotice,
  type LiveChange,
} from '@smarteverything/domain';
import type { CommittedSpeech } from '../transcripts/speech';
import type { Logger } from '@smarteverything/logging';

export type ChangeListener = (change: LiveChange) => void;

export type Unsubscribe = () => void;
export type CommitListener = () => void;
export type NoticeListener = (notice: CommittedNotice) => void;

interface FeedEvents {
  row: [change: LiveChange];
  notice: [notice: CommittedNotice];
  speech: [speech: CommittedSpeech];
  commit: [];
}

type Delivery = () => void;

export class ChangeFeed {
  private readonly emitter = new EventEmitter<FeedEvents>();
  private pending: Delivery[] | null = null;
  private delivered = 0;
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

  subscribeCommitted(listener: CommitListener): Unsubscribe {
    const guarded = this.guard('commit', listener);
    this.emitter.on('commit', guarded);
    return (): void => {
      this.emitter.off('commit', guarded);
    };
  }

  notice(raw: unknown): void {
    const notice = LIVE_NOTICE.parse(raw);
    this.dispatch(() => {
      this.counts.notices += 1;
      this.emitter.emit('notice', notice);
    });
  }

  speech(speech: CommittedSpeech): void {
    this.dispatch(() => {
      this.counts.speech += 1;
      this.emitter.emit('speech', speech);
    });
  }

  committed(): void {
    this.counts.commits += 1;
    this.emitter.emit('commit');
  }

  emit(change: unknown, onSequence?: (seq: number) => void): void {
    const row = ROW_CHANGE.parse(change);
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
  }

  release(): void {
    const deliveries = this.pending ?? [];
    this.pending = null;
    for (const delivery of deliveries) delivery();
  }

  discard(): void {
    if (this.pending !== null && this.pending.length > 0) {
      this.counts.discards += 1;
      this.log.debug('change.discarded', { held: this.pending.length });
    }
    this.pending = null;
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
