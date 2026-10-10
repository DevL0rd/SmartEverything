import { createHash } from 'node:crypto';
import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import type { PluginRecords } from '../contract';
import { canonical } from './canonical';
import { DiscordInputError, UncertainOutcomeError, outcomeUnknown } from './errors';
import { jsonOf } from './json';

const ENTRY = z.strictObject({
  fingerprint: z.string(),
  state: z.enum(['pending', 'done']),
  createdAt: z.number(),
  result: JSON_VALUE.optional(),
});

type Entry = z.output<typeof ENTRY>;

type Claim = { readonly replayed: true; readonly result: unknown } | { readonly replayed: false };

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

export class Journal {
  private readonly entries = new Map<string, Entry>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly records: PluginRecords,
    private readonly capacity: number,
    private readonly retentionMs: number,
    private readonly now: () => number,
  ) {}

  load(): void {
    for (const { key, value } of this.records.list()) {
      const parsed = ENTRY.safeParse(value);
      if (parsed.success) {
        this.entries.set(key, parsed.data);
      } else {
        this.records.remove(key);
      }
    }
    this.prune();
  }

  async execute(key: string, input: unknown, action: () => Promise<unknown>): Promise<unknown> {
    const id = hash(key);
    const fingerprint = hash(canonical(input));
    const claim = await this.locked(() => this.claim(id, fingerprint));
    if (claim.replayed) {
      return claim.result;
    }
    let result: unknown;
    try {
      result = await action();
    } catch (cause) {
      if (!outcomeUnknown(cause)) {
        await this.locked(() => {
          this.release(id);
        });
      }
      throw cause;
    }
    await this.locked(() => {
      this.store(id, { fingerprint, state: 'done', createdAt: this.now(), result: jsonOf(result) });
    });
    return result;
  }

  private async locked<T>(work: () => T): Promise<T> {
    const next = this.chain.then(work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private claim(id: string, fingerprint: string): Claim {
    this.prune();
    const previous = this.entries.get(id);
    if (previous !== undefined) {
      return { replayed: true, result: this.replay(previous, fingerprint) };
    }
    if (this.entries.size >= this.capacity) {
      throw new DiscordInputError('The idempotency journal is full of unresolved operations');
    }
    this.store(id, { fingerprint, state: 'pending', createdAt: this.now() });
    return { replayed: false };
  }

  private replay(entry: Entry, fingerprint: string): unknown {
    if (entry.fingerprint !== fingerprint) {
      throw new DiscordInputError('The idempotency key was used for different input');
    }
    if (entry.state === 'pending') {
      throw new UncertainOutcomeError(
        'Outcome uncertain; inspect Discord before any new operation',
      );
    }
    return entry.result;
  }

  private release(id: string): void {
    this.entries.delete(id);
    this.records.remove(id);
  }

  private store(id: string, entry: Entry): void {
    this.entries.set(id, entry);
    this.records.put(id, jsonOf(entry));
  }

  private prune(): void {
    const cutoff = this.now() - this.retentionMs;
    for (const [id, entry] of this.entries) {
      if (entry.createdAt < cutoff) {
        this.release(id);
      }
    }
    const done = [...this.entries.entries()]
      .filter(([, entry]) => entry.state === 'done')
      .sort(([, left], [, right]) => left.createdAt - right.createdAt);
    const excess = Math.max(0, this.entries.size - this.capacity + 1);
    for (const [id] of done.slice(0, excess)) {
      this.release(id);
    }
  }
}
