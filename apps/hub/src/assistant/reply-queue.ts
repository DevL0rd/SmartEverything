import type { AssistantMessageRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { errorOfHost } from '../store/host/errors';
import type { StoreHost } from '../store/host/host';
import type { ReplyOp } from './reply-records';
import type { ReplyOutcome } from './reply-units';

interface Waiter {
  readonly resolve: (value: AssistantMessageRow | null) => void;
  readonly reject: (cause: unknown) => void;
}

interface Entry {
  readonly op: ReplyOp;
  readonly waiters: Waiter[];
}

const STREAMING: ReadonlySet<ReplyOp['kind']> = new Set(['text', 'timeline', 'progress', 'todos']);

function replyOf(op: ReplyOp): string | null {
  return 'id' in op ? op.id : null;
}

function replaces(next: ReplyOp, queued: ReplyOp): boolean {
  if (replyOf(next) !== replyOf(queued)) return false;
  if (next.kind === 'progress')
    return queued.kind === 'progress' || queued.kind === 'timeline' || queued.kind === 'text';
  if (next.kind === 'timeline') return queued.kind === 'timeline';
  if (next.kind === 'text') return queued.kind === 'text';
  return false;
}

export class ReplyQueue {
  private batch: Entry[] = [];
  private scheduled: NodeJS.Immediate | null = null;
  private readonly sent = new Set<Promise<unknown>>();

  constructor(private readonly host: () => StoreHost) {}

  write(op: ReplyOp): Promise<AssistantMessageRow | null> {
    return new Promise((resolve, reject) => {
      const waiters: Waiter[] = [{ resolve, reject }];
      const kept: Entry[] = [];
      for (const entry of this.batch) {
        if (replaces(op, entry.op)) waiters.push(...entry.waiters);
        else kept.push(entry);
      }
      this.batch = [...kept, { op, waiters }];
      if (STREAMING.has(op.kind)) this.schedule();
      else this.flush();
    });
  }

  flush(): void {
    if (this.scheduled !== null) {
      clearImmediate(this.scheduled);
      this.scheduled = null;
    }
    const entries = this.batch;
    if (entries.length === 0) return;
    this.batch = [];
    const sent = this.host()
      .write('assistantReplyWrite', { ops: entries.map((entry) => entry.op) })
      .finally(() => {
        this.sent.delete(sent);
      });
    this.sent.add(sent);
    background(
      sent.then(
        (outcomes) => {
          entries.forEach((entry, index) => {
            settle(entry, outcomes[index]);
          });
        },
        (cause: unknown) => {
          for (const entry of entries) for (const waiter of entry.waiters) waiter.reject(cause);
        },
      ),
      'conversation.reply_write_failed',
    );
  }

  async settled(): Promise<void> {
    this.flush();
    while (this.sent.size > 0) await Promise.allSettled([...this.sent]);
  }

  private schedule(): void {
    if (this.scheduled !== null) return;
    this.scheduled = setImmediate(() => {
      this.scheduled = null;
      this.flush();
    });
  }
}

class ReplyOutcomeMissingError extends Error {
  override readonly name = 'ReplyOutcomeMissingError';

  constructor(readonly op: ReplyOp['kind']) {
    super(`The store host returned no outcome for the ${op} reply write.`);
  }
}

function settle(entry: Entry, outcome: ReplyOutcome | undefined): void {
  for (const waiter of entry.waiters) {
    if (outcome === undefined) waiter.reject(new ReplyOutcomeMissingError(entry.op.kind));
    else if (outcome.ok) waiter.resolve(outcome.value);
    else waiter.reject(errorOfHost(outcome.error));
  }
}
