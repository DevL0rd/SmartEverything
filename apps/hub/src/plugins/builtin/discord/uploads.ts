import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import { DiscordInputError } from './errors';
import { FILE_NAME, UPLOAD_MIME, inspectFile } from './media-formats';
import type { OutFile } from './outgoing';

const TTL_MS = 10 * 60_000;
const MAX_UPLOADS = 16;
const MAX_RESERVED_BYTES = 16 * 1024 * 1024;
const MAX_CALLER_UPLOADS = 8;
const MAX_CALLER_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 131_072;
const BASE64_MAX = 174_764;

export const UPLOAD_BEGIN = z.strictObject({
  fileName: FILE_NAME,
  mimeType: UPLOAD_MIME,
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional()
    .describe('Optional. When given, the sealed bytes must match it.'),
  idempotencyKey: z.string().min(8).max(128),
});

export const UPLOAD_CHUNK = z.strictObject({
  uploadId: z.uuid(),
  offset: z.number().int().min(0),
  base64: z.string().min(4).max(BASE64_MAX),
});

export const UPLOAD_ID = z.strictObject({ uploadId: z.uuid() });

type BeginInput = z.output<typeof UPLOAD_BEGIN>;
type ChunkInput = z.output<typeof UPLOAD_CHUNK>;

interface Upload {
  readonly id: string;
  readonly owner: string;
  readonly input: BeginInput;
  readonly expires: number;
  readonly bytes: Buffer;
  length: number;
  sha256: string | undefined;
}

interface UploadState {
  readonly uploadId: string;
  readonly offset: number;
  readonly sealed: boolean;
  readonly expiresAt: string;
}

interface SealedState extends UploadState {
  readonly sha256: string;
}

function describe(item: Upload): UploadState {
  return {
    uploadId: item.id,
    offset: item.length,
    sealed: item.sha256 !== undefined,
    expiresAt: new Date(item.expires).toISOString(),
  };
}

export function uploaderOf(caller: ToolCaller): string {
  return caller.chatId ?? 'owner';
}

export class Uploads {
  private readonly items = new Map<string, Upload>();

  constructor(private readonly now: () => number) {}

  begin(input: BeginInput, maxFileBytes: number, owner: string): UploadState {
    this.prune();
    const mine = [...this.items.values()].filter((item) => item.owner === owner);
    const previous = mine.find((item) => item.input.idempotencyKey === input.idempotencyKey);
    if (previous !== undefined) {
      if (JSON.stringify(previous.input) !== JSON.stringify(input)) {
        throw new DiscordInputError('Upload key reused with different input');
      }
      return describe(previous);
    }
    this.assertRoom(input.size, maxFileBytes, mine);
    const item: Upload = {
      id: randomUUID(),
      owner,
      input,
      expires: this.now() + TTL_MS,
      bytes: Buffer.alloc(input.size),
      length: 0,
      sha256: undefined,
    };
    this.items.set(item.id, item);
    setTimeout(() => {
      this.prune();
    }, TTL_MS + 1000).unref();
    return describe(item);
  }

  chunk(input: ChunkInput, owner: string): UploadState {
    const item = this.get(input.uploadId, owner);
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length > CHUNK_BYTES || bytes.toString('base64') !== input.base64) {
      throw new DiscordInputError('Invalid or oversized base64 chunk');
    }
    if (input.offset < item.length) {
      const end = input.offset + bytes.length;
      if (end > item.length || !item.bytes.subarray(input.offset, end).equals(bytes)) {
        throw new DiscordInputError('Changed retry chunk');
      }
      return describe(item);
    }
    if (
      item.sha256 !== undefined ||
      input.offset !== item.length ||
      item.length + bytes.length > item.input.size
    ) {
      throw new DiscordInputError('Chunks must be contiguous and within declared size');
    }
    bytes.copy(item.bytes, item.length);
    item.length += bytes.length;
    return describe(item);
  }

  async seal(uploadId: string, owner: string): Promise<SealedState> {
    const item = this.get(uploadId, owner);
    if (item.length !== item.input.size) {
      throw new DiscordInputError('Incomplete upload');
    }
    const sha256 = createHash('sha256').update(item.bytes).digest('hex');
    if (item.input.sha256 !== undefined && sha256 !== item.input.sha256) {
      throw new DiscordInputError('Upload hash mismatch');
    }
    await inspectFile(item.bytes, item.input.fileName, item.input.mimeType);
    this.get(uploadId, owner);
    item.sha256 = sha256;
    return { ...describe(item), sha256 };
  }

  ready(uploadIds: readonly string[], owner: string): Map<string, OutFile> {
    return new Map(
      uploadIds.map((uploadId) => {
        const item = this.get(uploadId, owner);
        if (item.sha256 === undefined) {
          throw new DiscordInputError('Upload must be sealed first');
        }
        const file: OutFile = {
          data: Buffer.from(item.bytes),
          name: item.input.fileName,
          contentType: item.input.mimeType,
          sha256: item.sha256,
        };
        return [uploadId, file];
      }),
    );
  }

  private assertRoom(size: number, maxFileBytes: number, mine: readonly Upload[]): void {
    if (size > maxFileBytes) {
      throw new DiscordInputError(
        `Upload of ${String(size)} bytes is over the file limit of ${String(maxFileBytes)} bytes`,
      );
    }
    const used = (list: Iterable<Upload>): number =>
      [...list].reduce((sum, item) => sum + item.input.size, 0);
    if (mine.length >= MAX_CALLER_UPLOADS || used(mine) + size > MAX_CALLER_BYTES) {
      throw new DiscordInputError(
        `Your uploads are full (${String(MAX_CALLER_UPLOADS)} files, ${String(MAX_CALLER_BYTES)} bytes); wait for them to expire`,
      );
    }
    if (this.items.size >= MAX_UPLOADS || used(this.items.values()) + size > MAX_RESERVED_BYTES) {
      throw new DiscordInputError(
        `Upload space is full (${String(MAX_UPLOADS)} files, ${String(MAX_RESERVED_BYTES)} bytes); try again later`,
      );
    }
  }

  private get(uploadId: string, owner: string): Upload {
    this.prune();
    const item = this.items.get(uploadId);
    if (item?.owner !== owner) {
      throw new DiscordInputError('Upload is unknown or expired');
    }
    return item;
  }

  private prune(): void {
    for (const [id, item] of this.items) {
      if (item.expires <= this.now()) {
        this.items.delete(id);
      }
    }
  }
}
