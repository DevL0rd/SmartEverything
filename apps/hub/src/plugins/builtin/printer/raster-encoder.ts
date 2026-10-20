import { Worker } from 'node:worker_threads';
import { PrinterError } from '@smarteverything/domain';
import type { RasterPage } from '@smarteverything/ipp';
import type { Logger } from '@smarteverything/logging';
import { reasonOf } from './session-host';
import { RASTER_REPLY } from './raster-protocol';

export type PageEncoder = (pages: AsyncIterable<RasterPage>) => Promise<readonly Uint8Array[]>;

export class RasterWorkerError extends Error {
  override readonly name = 'RasterWorkerError';

  constructor(
    readonly script: string,
    readonly exitCode: number | null,
  ) {
    super(
      `The raster worker ${script} stopped${exitCode === null ? '' : ` with exit code ${String(exitCode)}`} before it answered.`,
    );
  }
}

function encodeOne(worker: Worker, script: string, page: RasterPage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    const onMessage = (raw: unknown): void => {
      finish();
      const reply = RASTER_REPLY.safeParse(raw);
      if (!reply.success) reject(reply.error);
      else if ('error' in reply.data)
        reject(new PrinterError('format_unsupported', reply.data.error));
      else resolve(reply.data.bytes);
    };
    const onError = (cause: Error): void => {
      finish();
      reject(cause);
    };
    const onExit = (code: number): void => {
      finish();
      reject(new RasterWorkerError(script, code));
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    const own = new Uint8Array(page.pixels);
    worker.postMessage({ ...page, pixels: own }, [own.buffer]);
  });
}

export function workerEncoder(script: string, signal: AbortSignal, log: Logger): PageEncoder {
  return async (pages) => {
    const worker = new Worker(script);
    const stop = (): void => {
      worker.terminate().catch((cause: unknown) => {
        log.warn('printer.raster_worker_stop_failed', { reason: reasonOf(cause) });
      });
    };
    signal.addEventListener('abort', stop, { once: true });
    try {
      const encoded: Uint8Array[] = [];
      for await (const page of pages) encoded.push(await encodeOne(worker, script, page));
      return encoded;
    } finally {
      signal.removeEventListener('abort', stop);
      await worker.terminate();
    }
  };
}
