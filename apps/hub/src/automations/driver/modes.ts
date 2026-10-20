import type { RunPolicy } from '@smarteverything/domain';

export type ModePolicy = Pick<RunPolicy, 'mode' | 'max' | 'maxWait' | 'key'>;

export type ModeRefusal = 'single_busy' | 'queue_full' | 'parallel_full';

export interface Ticket<T> {
  readonly runId: string;
  readonly payload: T;
}

export type ModeVerdict<T> =
  | { readonly kind: 'start' }
  | {
      readonly kind: 'queued';
      readonly cancel: readonly string[];
      readonly superseded: readonly Ticket<T>[];
    }
  | { readonly kind: 'refused'; readonly reason: ModeRefusal };

export interface Released<T> {
  readonly start: readonly Ticket<T>[];
  readonly stale: readonly Ticket<T>[];
}

interface Waiting<T> extends Ticket<T> {
  readonly policy: ModePolicy;
  readonly queuedAt: number;
}

interface Book<T> {
  readonly active: Set<string>;
  readonly queue: Waiting<T>[];
}

const KEY_PREFIX = '\u0000key:';

export function bookIdOf(automationId: string, key: string | undefined): string {
  return key === undefined ? automationId : `${KEY_PREFIX}${key}`;
}

function limitOf(policy: ModePolicy): number {
  return policy.mode === 'parallel' ? (policy.max ?? Infinity) : 1;
}

export class ModeBook<T> {
  private readonly books = new Map<string, Book<T>>();

  request(bookId: string, ticket: Ticket<T>, policy: ModePolicy, now: number): ModeVerdict<T> {
    const book = this.bookOf(bookId);
    switch (policy.mode) {
      case 'single':
        return book.active.size > 0 ? this.refuse('single_busy') : this.begin(book, ticket);
      case 'parallel':
        return book.active.size >= limitOf(policy)
          ? this.refuse('parallel_full')
          : this.begin(book, ticket);
      case 'queue':
        return this.queued(book, ticket, policy, now);
      case 'restart':
        return this.restarted(book, ticket, policy, now);
    }
  }

  adopt(bookId: string, runId: string): void {
    this.bookOf(bookId).active.add(runId);
  }

  active(bookId: string): readonly string[] {
    return [...(this.books.get(bookId)?.active ?? [])];
  }

  waiting(bookId: string): number {
    return this.books.get(bookId)?.queue.length ?? 0;
  }

  withdraw(bookId: string, runId: string): void {
    const book = this.books.get(bookId);
    if (book === undefined) return;
    const kept = book.queue.filter((entry) => entry.runId !== runId);
    book.queue.splice(0, book.queue.length, ...kept);
  }

  clearQueue(bookId: string, matches: (ticket: Ticket<T>) => boolean): readonly Ticket<T>[] {
    const book = this.books.get(bookId);
    if (book === undefined) return [];
    const cleared = book.queue.filter(matches);
    const kept = book.queue.filter((entry) => !matches(entry));
    book.queue.splice(0, book.queue.length, ...kept);
    if (book.active.size === 0 && book.queue.length === 0) this.books.delete(bookId);
    return cleared.map(({ runId, payload }) => ({ runId, payload }));
  }

  release(bookId: string, runId: string, now: number): Released<T> {
    const book = this.books.get(bookId);
    if (book === undefined) return { start: [], stale: [] };
    book.active.delete(runId);
    const released = this.pump(book, now);
    if (book.active.size === 0 && book.queue.length === 0) this.books.delete(bookId);
    return released;
  }

  private bookOf(bookId: string): Book<T> {
    const book = this.books.get(bookId) ?? { active: new Set<string>(), queue: [] };
    this.books.set(bookId, book);
    return book;
  }

  private refuse(reason: ModeRefusal): ModeVerdict<T> {
    return { kind: 'refused', reason };
  }

  private begin(book: Book<T>, ticket: Ticket<T>): ModeVerdict<T> {
    book.active.add(ticket.runId);
    return { kind: 'start' };
  }

  private queued(
    book: Book<T>,
    ticket: Ticket<T>,
    policy: ModePolicy,
    now: number,
  ): ModeVerdict<T> {
    if (book.active.size === 0 && book.queue.length === 0) return this.begin(book, ticket);
    if (policy.max !== undefined && book.queue.length >= policy.max)
      return this.refuse('queue_full');
    book.queue.push({ ...ticket, policy, queuedAt: now });
    return { kind: 'queued', cancel: [], superseded: [] };
  }

  private restarted(
    book: Book<T>,
    ticket: Ticket<T>,
    policy: ModePolicy,
    now: number,
  ): ModeVerdict<T> {
    if (book.active.size === 0) return this.begin(book, ticket);
    const superseded = book.queue.splice(0, book.queue.length, {
      ...ticket,
      policy,
      queuedAt: now,
    });
    return { kind: 'queued', cancel: [...book.active], superseded };
  }

  private pump(book: Book<T>, now: number): Released<T> {
    const start: Ticket<T>[] = [];
    const stale: Ticket<T>[] = [];
    for (let head = book.queue[0]; head !== undefined; head = book.queue[0]) {
      if (book.active.size >= limitOf(head.policy)) break;
      book.queue.shift();
      const { policy, queuedAt, ...ticket } = head;
      if (policy.maxWait !== undefined && now - queuedAt > policy.maxWait) {
        stale.push(ticket);
      } else {
        book.active.add(ticket.runId);
        start.push(ticket);
      }
    }
    return { start, stale };
  }
}
