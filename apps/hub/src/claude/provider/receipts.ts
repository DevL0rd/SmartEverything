import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { platform } from 'node:process';
import { z } from 'zod';
import { ProviderInputError } from './input';

const RECEIPT = z.strictObject({
  job_id: z.uuid(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  session_id: z.string().nullable(),
});
const RECORDS = z.array(RECEIPT).max(10_000);
export type ProviderReceipt = z.infer<typeof RECEIPT>;
export class ProviderReceipts {
  private records: ProviderReceipt[] = [];
  private readonly loaded: Promise<void>;
  private writing = Promise.resolve();
  constructor(private readonly directory: string) {
    this.loaded = this.load();
    void this.loaded.catch((): void => undefined);
  }
  async admit(receipt: ProviderReceipt): Promise<ProviderReceipt | null> {
    let known: ProviderReceipt | null = null;
    const writing = this.writing.then(async () => {
      await this.loaded;
      const previous = this.records.find((entry) => entry.job_id === receipt.job_id);
      if (previous !== undefined) {
        known = previous;
        return;
      }
      if (this.records.length >= 10_000)
        throw new ProviderInputError(
          'The durable provider receipt limit is reached. Retain the receipt store; existing outcomes must not be replayed.',
        );
      const next = [...this.records, RECEIPT.parse(receipt)];
      await this.save(next);
      this.records = next;
    });
    this.writing = writing;
    await writing;
    const result = RECEIPT.nullable().parse(known);
    if (result !== null && result.signature !== receipt.signature)
      throw new ProviderInputError('The provider job ID was reused with different input.');
    return result;
  }
  private async save(records: readonly ProviderReceipt[]): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, 'provider-receipts.json');
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(records)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    if (platform === 'win32') return;
    const directory = await open(this.directory, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  private async load(): Promise<void> {
    try {
      const json: unknown = JSON.parse(
        await readFile(join(this.directory, 'provider-receipts.json'), 'utf8'),
      );
      this.records = RECORDS.parse(json);
      if (new Set(this.records.map((record) => record.job_id)).size !== this.records.length)
        throw new ProviderInputError(
          'The durable provider receipt store contains duplicate job IDs.',
        );
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
        throw new ProviderInputError(
          'The durable provider receipt store is invalid or unreadable; no work will be replayed.',
        );
    }
  }
}
