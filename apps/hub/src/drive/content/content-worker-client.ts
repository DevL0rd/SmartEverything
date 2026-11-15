import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { CONTENT_RESPONSE, type ContentRequest, type ContentResponse } from './content-protocol';

export const BUNDLED_CONTENT_WORKER = fileURLToPath(
  new URL('./content-worker.mjs', import.meta.url),
);

type Fields = ContentRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;

export class ContentWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<
    number,
    {
      readonly resolve: (response: ContentResponse) => void;
      readonly reject: (cause: Error) => void;
    }
  >();
  private next = 0;
  private closed = false;

  constructor(script: string) {
    this.worker = new Worker(script);
    this.worker.on('message', (raw: unknown) => {
      this.answer(CONTENT_RESPONSE.parse(raw));
    });
    this.worker.on('error', (cause) => {
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
    });
    this.worker.on('exit', (code) => {
      if (!this.closed) {
        this.fail(new Error(`The content worker stopped with code ${String(code)}.`));
      }
    });
  }

  request(fields: Fields): Promise<ContentResponse> {
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...fields, id });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.fail(new Error('The content worker was stopped.'));
    await this.worker.terminate();
  }

  private answer(response: ContentResponse): void {
    const waiting = this.pending.get(response.id);
    this.pending.delete(response.id);
    waiting?.resolve(response);
  }

  private fail(cause: Error): void {
    for (const waiting of this.pending.values()) waiting.reject(cause);
    this.pending.clear();
  }
}
