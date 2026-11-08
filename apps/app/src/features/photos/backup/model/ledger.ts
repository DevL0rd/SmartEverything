import { z } from 'zod';

const LEDGER_ENTRY = z.strictObject({
  localId: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.int().nonnegative(),
  modificationTime: z.number(),
  uploadedAt: z.iso.datetime({ offset: true }).nullable(),
  itemId: z.uuid().nullable(),
});

export type LedgerEntry = z.infer<typeof LEDGER_ENTRY>;

export const STORED_LEDGER = z.strictObject({
  version: z.literal(2),
  lastSeen: z.number(),
  entries: z.array(LEDGER_ENTRY),
});

export type StoredLedger = z.infer<typeof STORED_LEDGER>;

export class Ledger {
  private readonly entries: Map<string, LedgerEntry>;
  private seen: number;

  constructor(stored?: StoredLedger) {
    this.entries = new Map((stored?.entries ?? []).map((entry) => [entry.localId, entry]));
    this.seen = stored?.lastSeen ?? 0;
  }

  get lastSeen(): number {
    return this.seen;
  }

  advance(modificationTime: number): void {
    this.seen = Math.max(this.seen, modificationTime);
  }

  rewind(): void {
    this.seen = 0;
  }

  find(localId: string): LedgerEntry | undefined {
    return this.entries.get(localId);
  }

  has(localId: string): boolean {
    return this.entries.has(localId);
  }

  put(entry: LedgerEntry): void {
    this.entries.set(entry.localId, entry);
  }

  markUploaded(localId: string, uploadedAt: string, itemId: string): void {
    const entry = this.entries.get(localId);
    if (entry !== undefined) this.entries.set(localId, { ...entry, uploadedAt, itemId });
  }

  identifyUploaded(localId: string, itemId: string): void {
    const entry = this.entries.get(localId);
    if (entry !== undefined && entry.uploadedAt !== null)
      this.entries.set(localId, { ...entry, itemId });
  }

  forget(localIds: Iterable<string>): void {
    for (const localId of localIds) this.entries.delete(localId);
  }

  localIds(): ReadonlySet<string> {
    return new Set(this.entries.keys());
  }

  uploaded(): readonly LedgerEntry[] {
    return [...this.entries.values()].filter((entry) => entry.uploadedAt !== null);
  }

  latestUpload(): string | null {
    return this.uploaded().reduce<string | null>(
      (latest, entry) =>
        entry.uploadedAt !== null && (latest === null || entry.uploadedAt > latest)
          ? entry.uploadedAt
          : latest,
      null,
    );
  }

  toStored(): StoredLedger {
    return { version: 2, lastSeen: this.seen, entries: [...this.entries.values()] };
  }
}
