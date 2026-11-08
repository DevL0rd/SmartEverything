import { readFile } from 'node:fs/promises';
import { availableParallelism, freemem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { crc32, deflateSync } from 'node:zlib';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import sharp from 'sharp';
import { z } from 'zod';
import { DERIVED_LONG_EDGE } from './derived-paths';
import type { HeicRequest } from './heic-worker';
import type { DecodedSource, DecodeOutcome, PreviewDecoder } from './preview';

export const BUNDLED_HEIC_WORKER = fileURLToPath(new URL('./heic-worker.mjs', import.meta.url));

export const HEIC_BYTES_PER_PIXEL = 12;

export const HEIC_RECYCLE_PIXELS = 24_000_000;

const HEIC_MIMES: ReadonlySet<string> = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const RGBA_CHANNELS = 4;

const PNG_HEADER_END = 8 + 8 + 13 + 4;

const HEIC_REPLY = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('opened'), width: z.number(), height: z.number() }),
  z.strictObject({ kind: z.literal('unsupported'), reason: z.string() }),
  z.strictObject({
    kind: z.literal('pixels'),
    width: z.number(),
    height: z.number(),
    data: z.instanceof(Uint8Array),
  }),
]);

type HeicReply = z.infer<typeof HEIC_REPLY>;

export type HeicOutcome =
  | { readonly kind: 'unsupported'; readonly reason: string }
  | {
      readonly kind: 'pixels';
      readonly width: number;
      readonly height: number;
      readonly data: Uint8Array;
    };

export interface HeicPoolEnvironment {
  readonly script: string;
  readonly workers: number;
  readonly freeMemory: () => number;
  readonly log: Logger;
}

export function heicWorkerCount(): number {
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

export function heicPoolEnvironment(log: Logger): HeicPoolEnvironment {
  return {
    script: BUNDLED_HEIC_WORKER,
    workers: heicWorkerCount(),
    freeMemory: freemem,
    log,
  };
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('The decode was aborted.', { cause: signal.reason });
}

class Waiting<T> {
  private readonly queue: ((value: T) => void)[] = [];

  wait(signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const take = (value: T): void => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      };
      const cancel = (): void => {
        const at = this.queue.indexOf(take);
        if (at >= 0) this.queue.splice(at, 1);
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', cancel, { once: true });
      this.queue.push(take);
    });
  }

  next(value: T): boolean {
    const take = this.queue.shift();
    if (take === undefined) return false;
    take(value);
    return true;
  }

  all(value: T): void {
    for (const take of this.queue.splice(0)) take(value);
  }
}

class HeicSlot {
  private worker: Worker | undefined;

  constructor(private readonly script: string) {}

  exchange(request: HeicRequest, transfer: readonly ArrayBuffer[]): Promise<HeicReply> {
    const worker = this.worker ?? this.spawn();
    return new Promise((resolve, reject) => {
      const detach = (): void => {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };
      const fail = (cause: Error): void => {
        detach();
        if (this.worker === worker) this.worker = undefined;
        reject(cause);
      };
      const onMessage = (raw: unknown): void => {
        detach();
        resolve(HEIC_REPLY.parse(raw));
      };
      const onError = (cause: Error): void => {
        fail(cause);
      };
      const onExit = (code: number): void => {
        fail(new Error(`The HEIC worker stopped with code ${String(code)}.`));
      };
      worker.once('message', onMessage);
      worker.once('error', onError);
      worker.once('exit', onExit);
      worker.postMessage(request, [...transfer]);
    });
  }

  async retire(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    await worker?.terminate();
  }

  private spawn(): Worker {
    const worker = new Worker(this.script);
    this.worker = worker;
    return worker;
  }
}

type HeicPixels = Extract<HeicOutcome, { readonly kind: 'pixels' }>;

function unsupported(reason: string): HeicOutcome {
  return { kind: 'unsupported', reason };
}

function outcomeOf(reply: HeicReply): HeicOutcome {
  if (reply.kind === 'opened') throw new Error('The HEIC worker answered a display with an open.');
  return reply;
}

export class HeicPool {
  private readonly idle: HeicSlot[];
  private readonly slots: HeicSlot[];
  private readonly slotWaiting = new Waiting<HeicSlot>();
  private readonly memoryWaiting = new Waiting<undefined>();
  private reserved = 0;

  constructor(private readonly env: HeicPoolEnvironment) {
    this.slots = Array.from({ length: env.workers }, () => new HeicSlot(env.script));
    this.idle = [...this.slots];
  }

  async decode(bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<HeicOutcome> {
    const slot = await this.acquire(signal);
    const stop = (): void => {
      background(slot.retire(), 'photos.heic_worker_stop_failed');
    };
    signal.addEventListener('abort', stop, { once: true });
    try {
      return await this.convert(slot, bytes, signal);
    } catch (cause) {
      if (signal.aborted) throw cause;
      this.env.log.error('photos.heic_worker_crashed', cause);
      return unsupported(`The decoder stopped while reading this file: ${messageOf(cause)}`);
    } finally {
      signal.removeEventListener('abort', stop);
      this.release(slot);
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.slots.map((slot) => slot.retire()));
  }

  private async convert(
    slot: HeicSlot,
    bytes: Uint8Array<ArrayBuffer>,
    signal: AbortSignal,
  ): Promise<HeicOutcome> {
    const opened = await slot.exchange({ kind: 'open', bytes }, [bytes.buffer]);
    if (opened.kind === 'unsupported') return opened;
    if (opened.kind === 'pixels') throw new Error('The HEIC worker answered an open with pixels.');
    const pixels = opened.width * opened.height;
    const need = pixels * HEIC_BYTES_PER_PIXEL;
    if (!(await this.admit(need, signal))) {
      return unsupported(`The image needs ${String(need)} bytes to decode, more than is free.`);
    }
    try {
      return outcomeOf(await slot.exchange({ kind: 'display' }, []));
    } finally {
      this.reserved -= need;
      this.memoryWaiting.all(undefined);
      if (pixels > HEIC_RECYCLE_PIXELS) {
        this.env.log.info('photos.heic_worker_recycled', { pixels });
        await slot.retire();
      }
    }
  }

  private async admit(need: number, signal: AbortSignal): Promise<boolean> {
    for (;;) {
      if (this.reserved + need <= this.env.freeMemory()) {
        this.reserved += need;
        return true;
      }
      if (this.reserved === 0) return false;
      this.env.log.debug('photos.heic_waiting_for_memory', { need, reserved: this.reserved });
      await this.memoryWaiting.wait(signal);
    }
  }

  private acquire(signal: AbortSignal): Promise<HeicSlot> {
    const free = this.idle.pop();
    if (free !== undefined) return Promise.resolve(free);
    return this.slotWaiting.wait(signal);
  }

  private release(slot: HeicSlot): void {
    if (!this.slotWaiting.next(slot)) this.idle.push(slot);
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const tag = Buffer.from(type, 'latin1');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])) >>> 0);
  return Buffer.concat([length, tag, data, checksum]);
}

function embedProfile(png: Buffer, profile: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from('icc\0\0', 'latin1'), deflateSync(profile)]);
  return Buffer.concat([
    png.subarray(0, PNG_HEADER_END),
    pngChunk('iCCP', body),
    png.subarray(PNG_HEADER_END),
  ]);
}

async function toSrgb(pixels: HeicPixels, profile: Buffer): Promise<DecodedSource> {
  const edge = DERIVED_LONG_EDGE.preview;
  const tagged = embedProfile(
    await sharp(pixels.data, {
      raw: { width: pixels.width, height: pixels.height, channels: RGBA_CHANNELS },
    })
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 1 })
      .toBuffer(),
    profile,
  );
  const converted = await sharp(tagged)
    .pipelineColourspace('rgb16')
    .toColourspace('srgb')
    .ensureAlpha()
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  return {
    kind: 'pixels',
    data: converted.data,
    width: converted.info.width,
    height: converted.info.height,
  };
}

async function sourceOf(path: string, pixels: HeicPixels): Promise<DecodedSource> {
  const { icc } = await sharp(path).metadata();
  if (icc === undefined) {
    return { kind: 'pixels', data: pixels.data, width: pixels.width, height: pixels.height };
  }
  return toSrgb(pixels, icc);
}

export function heicDecoder(pool: HeicPool): PreviewDecoder {
  return {
    id: 'heic',
    accepts: (file) => HEIC_MIMES.has(file.mime),
    decode: async (file, signal): Promise<DecodeOutcome> => {
      const outcome = await pool.decode(new Uint8Array(await readFile(file.path)), signal);
      if (outcome.kind === 'unsupported') return outcome;
      return { kind: 'decoded', source: await sourceOf(file.path, outcome) };
    },
  };
}
