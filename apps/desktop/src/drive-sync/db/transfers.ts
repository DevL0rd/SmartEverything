import { z } from 'zod';
import { INTEGER, type ClientSql } from './sql.js';

const TRANSFER_ROW = z
  .object({
    txn: z.string(),
    item: z.string(),
    block_count: INTEGER,
    verified: z.instanceof(Uint8Array),
  })
  .strict()
  .readonly();

export interface Transfer {
  readonly txn: string;
  readonly item: string;
  readonly blockCount: number;
  readonly verified: readonly boolean[];
}

function unpack(bitmap: Uint8Array, count: number): readonly boolean[] {
  return Array.from(
    { length: count },
    (_, index) => ((bitmap[index >> 3] ?? 0) & (1 << (index & 7))) !== 0,
  );
}

export class TransfersRepository {
  constructor(private readonly sql: ClientSql) {}

  begin(txn: string, item: string, blockCount: number): void {
    this.sql.run(
      `insert into transfers (txn, item, block_count, verified) values (?1, ?2, ?3, zeroblob((?3 + 7) / 8))
       on conflict (txn, item) do nothing`,
      [txn, item, blockCount],
    );
  }

  get(txn: string, item: string): Transfer | undefined {
    const row = this.sql.get(
      TRANSFER_ROW,
      'select txn, item, block_count, verified from transfers where txn = ? and item = ?',
      [txn, item],
    );
    return row === undefined
      ? undefined
      : {
          txn: row.txn,
          item: row.item,
          blockCount: row.block_count,
          verified: unpack(row.verified, row.block_count),
        };
  }

  markVerified(txn: string, item: string, index: number): boolean {
    return this.sql.transaction(() => {
      const row = this.sql.get(
        TRANSFER_ROW,
        'select txn, item, block_count, verified from transfers where txn = ? and item = ?',
        [txn, item],
      );
      if (row === undefined) return false;
      if (!Number.isInteger(index) || index < 0 || index >= row.block_count) {
        throw new RangeError(`block ${String(index)} is outside 0..${String(row.block_count)}`);
      }
      const bitmap = Uint8Array.from(row.verified);
      bitmap[index >> 3] = (bitmap[index >> 3] ?? 0) | (1 << (index & 7));
      this.sql.run('update transfers set verified = ? where txn = ? and item = ?', [
        bitmap,
        txn,
        item,
      ]);
      return true;
    });
  }

  complete(txn: string, item: string): boolean {
    return this.sql.run('delete from transfers where txn = ? and item = ?', [txn, item]) === 1;
  }

  list(): readonly Transfer[] {
    return this.sql
      .all(
        TRANSFER_ROW,
        'select txn, item, block_count, verified from transfers order by txn, item',
      )
      .map((row) => ({
        txn: row.txn,
        item: row.item,
        blockCount: row.block_count,
        verified: unpack(row.verified, row.block_count),
      }));
  }
}
