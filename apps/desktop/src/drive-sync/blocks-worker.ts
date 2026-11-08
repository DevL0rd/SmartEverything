import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import process from 'node:process';
import { isMainThread, parentPort } from 'node:worker_threads';
import { z } from 'zod';

export const BLOCK_REQUEST = z
  .object({
    id: z.number().int().nonnegative(),
    path: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    blockSize: z.number().int().positive(),
  })
  .strict()
  .readonly();

export const BLOCK_RESPONSE = z.discriminatedUnion('ok', [
  z
    .object({
      id: z.number().int().nonnegative(),
      ok: z.literal(true),
      hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).readonly(),
      bytesRead: z.number().int().nonnegative(),
    })
    .strict()
    .readonly(),
  z
    .object({
      id: z.number().int().nonnegative(),
      ok: z.literal(false),
      message: z.string(),
    })
    .strict()
    .readonly(),
]);

export type BlockRequest = z.infer<typeof BLOCK_REQUEST>;
export type BlockResponse = z.infer<typeof BLOCK_RESPONSE>;

export interface HashedBlocks {
  readonly hashes: readonly string[];
  readonly bytesRead: number;
}

export async function hashFileBlocks(request: BlockRequest): Promise<HashedBlocks> {
  const hashes: string[] = [];
  if (request.bytes === 0) return { hashes, bytesRead: 0 };
  let hash = createHash('sha256');
  let filled = 0;
  let bytesRead = 0;
  const stream = createReadStream(request.path, {
    start: 0,
    end: request.bytes - 1,
    highWaterMark: request.blockSize,
  });
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('file stream produced text');
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(request.blockSize - filled, chunk.length - offset);
      hash.update(chunk.subarray(offset, offset + take));
      offset += take;
      filled += take;
      if (filled === request.blockSize) {
        hashes.push(hash.digest('hex'));
        hash = createHash('sha256');
        filled = 0;
      }
    }
    bytesRead += chunk.length;
  }
  if (filled > 0) hashes.push(hash.digest('hex'));
  return { hashes, bytesRead };
}

async function answer(request: BlockRequest): Promise<BlockResponse> {
  try {
    const { hashes, bytesRead } = await hashFileBlocks(request);
    return { id: request.id, ok: true, hashes, bytesRead };
  } catch (cause) {
    return {
      id: request.id,
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

if (!isMainThread && parentPort !== null) {
  const port = parentPort;
  port.on('message', (raw: unknown) => {
    const request = BLOCK_REQUEST.parse(raw);
    answer(request).then(
      (response) => {
        port.postMessage(response);
      },
      (cause: unknown) => {
        process.nextTick(() => {
          throw cause;
        });
      },
    );
  });
}
