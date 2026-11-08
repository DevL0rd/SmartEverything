import { z } from 'zod';
import type { StoreContext } from '../context';

export const DRIVE_BLOCK_HASH_BYTES = 32;

const PACKED = z
  .instanceof(Uint8Array)
  .refine((hashes) => hashes.length % DRIVE_BLOCK_HASH_BYTES === 0, {
    message: 'packed block hashes must be whole 32-byte digests',
  });

const BLOCK_COLUMNS = z
  .strictObject({
    item_id: z.string(),
    rev: z.number(),
    block_size: z.number(),
    hashes: PACKED,
  })
  .transform((row): DriveBlocks => ({
    itemId: row.item_id,
    rev: row.rev,
    blockSize: row.block_size,
    hashes: row.hashes,
  }));

export interface DriveBlocks {
  readonly itemId: string;
  readonly rev: number;
  readonly blockSize: number;
  readonly hashes: Uint8Array;
}

export function packBlockHashes(digests: readonly Uint8Array[]): Uint8Array {
  const packed = new Uint8Array(digests.length * DRIVE_BLOCK_HASH_BYTES);
  digests.forEach((digest, index) => {
    if (digest.length !== DRIVE_BLOCK_HASH_BYTES) {
      throw new RangeError(`A block digest is ${String(digest.length)} bytes, not 32.`);
    }
    packed.set(digest, index * DRIVE_BLOCK_HASH_BYTES);
  });
  return packed;
}

export function blockHashAt(blocks: DriveBlocks, index: number): Uint8Array | undefined {
  const start = index * DRIVE_BLOCK_HASH_BYTES;
  if (index < 0 || start >= blocks.hashes.length) return undefined;
  return blocks.hashes.slice(start, start + DRIVE_BLOCK_HASH_BYTES);
}

export class DriveBlocksRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string, rev: number): DriveBlocks | undefined {
    return this.context.sql.get(
      BLOCK_COLUMNS,
      `select item_id, rev, block_size, hashes from drive_blocks
        where item_id = $itemId and rev = $rev`,
      { itemId, rev },
    );
  }

  put(blocks: DriveBlocks): DriveBlocks {
    PACKED.parse(blocks.hashes);
    return this.context.write(() => {
      this.context.sql.run(
        'store the packed block hashes',
        `insert into drive_blocks (item_id, rev, block_size, hashes)
          values ($itemId, $rev, $blockSize, $hashes)
          on conflict (item_id, rev) do update set block_size = excluded.block_size,
            hashes = excluded.hashes`,
        {
          itemId: blocks.itemId,
          rev: blocks.rev,
          blockSize: blocks.blockSize,
          hashes: blocks.hashes,
        },
      );
      return blocks;
    });
  }

  removeBefore(itemId: string, rev: number): number {
    return this.context.write(() =>
      this.context.sql.run(
        'drop the older block hashes',
        'delete from drive_blocks where item_id = $itemId and rev < $rev',
        { itemId, rev },
      ),
    );
  }
}
