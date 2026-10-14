import {
  LIVE_NOTICE,
  ROW_CHANGE,
  type CommittedNotice,
  type LiveChange,
  type RowChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export type ChangeListener = (change: LiveChange) => void;

export type Unsubscribe = () => void;
export type CommitListener = () => void;

type Pending =
  | { readonly kind: 'row'; readonly row: RowChange }
  | { readonly kind: 'notice'; readonly notice: CommittedNotice };
export type NoticeListener = (notice: CommittedNotice) => void;

interface ChangeSource {
  readonly subscribe: (listener: ChangeListener) => Unsubscribe;
}

export class ChangeFeed implements ChangeSource {
  private readonly listeners = new Set<ChangeListener>();
  private readonly commitListeners = new Set<CommitListener>();
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
      if (change.kind === 'row') this.deliver(change.row);
      else this.deliverNotice(change.notice);
    }
  }

  discard(): void {
    this.pending = null;
  }

  emit(change: unknown): void {
    const parsed = ROW_CHANGE.parse(change);
    if (this.pending === null) {
      this.deliver(parsed);
      return;
    }
    this.pending.push({ kind: 'row', row: parsed });
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

  private deliver(row: RowChange): void {
    this.delivered += 1;
    const change: LiveChange = { ...row, seq: this.delivered };
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
