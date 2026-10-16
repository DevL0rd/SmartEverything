import {
  LIVE_NOTICE,
  ROW_CHANGE,
  type CommittedNotice,
  type LiveChange,
  type RowChange,
} from '@smarteverything/domain';
import type { CommittedSpeech } from '../transcripts/speech';
import type { Logger } from '@smarteverything/logging';

export type ChangeListener = (change: LiveChange) => void;

export type Unsubscribe = () => void;
export type CommitListener = () => void;

type Pending =
  | {
      readonly kind: 'row';
      readonly row: RowChange;
      readonly onSequence: ((seq: number) => void) | undefined;
    }
  | { readonly kind: 'notice'; readonly notice: CommittedNotice }
  | { readonly kind: 'speech'; readonly speech: CommittedSpeech };
export type NoticeListener = (notice: CommittedNotice) => void;

interface ChangeSource {
  readonly subscribe: (listener: ChangeListener) => Unsubscribe;
}

export class ChangeFeed implements ChangeSource {
  private readonly listeners = new Set<ChangeListener>();
  private readonly commitListeners = new Set<CommitListener>();
  private readonly speechListeners = new Set<(speech: CommittedSpeech) => void>();
  private readonly noticeListeners = new Set<NoticeListener>();
  private pending: Pending[] | null = null;
  private delivered = 0;

  constructor(private readonly log: Logger) {}

  get seq(): number {
    return this.delivered;
  }

  subscribe(listener: ChangeListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeNotices(listener: NoticeListener): Unsubscribe {
    this.noticeListeners.add(listener);
    return (): void => {
      this.noticeListeners.delete(listener);
    };
  }

  notice(raw: unknown): void {
    const notice = LIVE_NOTICE.parse(raw);
    if (this.pending === null) this.deliverNotice(notice);
    else this.pending.push({ kind: 'notice', notice });
  }

  subscribeSpeech(listener: (speech: CommittedSpeech) => void): Unsubscribe {
    this.speechListeners.add(listener);
    return (): void => {
      this.speechListeners.delete(listener);
    };
  }

  speech(speech: CommittedSpeech): void {
    if (this.pending === null) this.deliverSpeech(speech);
    else this.pending.push({ kind: 'speech', speech });
  }

  private deliverSpeech(speech: CommittedSpeech): void {
    for (const listener of this.speechListeners) {
      try {
        listener(speech);
      } catch (cause) {
        this.log.warn('change.speech_listener_failed', {
          expected: 'a completed speech listener',
          received: typeof cause,
        });
      }
    }
  }

  subscribeCommitted(listener: CommitListener): Unsubscribe {
    this.commitListeners.add(listener);
    return (): void => {
      this.commitListeners.delete(listener);
    };
  }

  committed(): void {
    for (const listener of this.commitListeners) {
      try {
        listener();
      } catch (cause) {
        this.log.error('change.commit_listener_failed', cause);
      }
    }
  }

  hold(): void {
    this.pending = [];
  }

  release(): void {
    const changes = this.pending ?? [];
    this.pending = null;
    for (const change of changes) {
      if (change.kind === 'row') this.deliver(change.row, change.onSequence);
      else if (change.kind === 'notice') this.deliverNotice(change.notice);
      else this.deliverSpeech(change.speech);
    }
  }

  discard(): void {
    this.pending = null;
  }

  emit(change: unknown, onSequence?: (seq: number) => void): void {
    const parsed = ROW_CHANGE.parse(change);
    if (this.pending === null) {
      this.deliver(parsed, onSequence);
      return;
    }
    this.pending.push({ kind: 'row', row: parsed, onSequence });
  }

  private deliverNotice(notice: CommittedNotice): void {
    for (const listener of this.noticeListeners) {
      try {
        listener(notice);
      } catch (cause) {
        this.log.error('change.notice_listener_failed', cause, { type: notice.type });
      }
    }
  }

  private deliver(row: RowChange, onSequence: ((seq: number) => void) | undefined): void {
    this.delivered += 1;
    const change: LiveChange = { ...row, seq: this.delivered };
    try {
      onSequence?.(change.seq);
    } catch (cause) {
      this.log.error('change.sequence_listener_failed', cause, {
        table: change.table,
        operation: change.operation,
      });
    }
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (cause) {
        this.log.error('change.listener_failed', cause, {
          table: change.table,
          operation: change.operation,
        });
      }
    }
  }
}
