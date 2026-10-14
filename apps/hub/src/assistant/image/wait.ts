import {
  ApiError,
  type ImageOperationReceipt,
  type ImageWaitResult,
} from '@smarteverything/domain';

export interface ImageWaitOptions {
  readonly snapshot: () => readonly string[];
  readonly read: (id: string) => ImageOperationReceipt;
  readonly subscribe: (listener: (receipt: ImageOperationReceipt) => void) => () => void;
  readonly waitMs: number;
  readonly signal?: AbortSignal;
}

export function waitForImageBatch(options: ImageWaitOptions): Promise<ImageWaitResult> {
  return new ImageBatchWaiter(options).wait();
}

class ImageBatchWaiter {
  private ids: readonly string[] = [];
  private finished = false;
  private unsubscribe: () => void = () => undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private resolve: (result: ImageWaitResult) => void = () => undefined;
  private reject: (cause: unknown) => void = () => undefined;
  constructor(private readonly options: ImageWaitOptions) {}

  wait(): Promise<ImageWaitResult> {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      try {
        this.unsubscribe = this.options.subscribe((receipt) => {
          if (terminal(receipt) && this.ids.includes(receipt.id)) this.changed();
        });
        this.options.signal?.addEventListener('abort', this.aborted, { once: true });
        this.options.signal?.throwIfAborted();
        this.ids = this.options.snapshot();
        this.changed();
        if (!this.finished)
          this.timeout = setTimeout(() => {
            this.finish('timed_out');
          }, this.options.waitMs);
      } catch (cause) {
        this.fail(cause);
      }
    });
  }

  private readonly aborted = (): void => {
    this.fail(new ApiError('conflict', 'The image wait was cancelled; generation continues.'));
  };

  private changed(): void {
    try {
      if (this.ids.every((id) => terminal(this.options.read(id)))) this.finish('finished');
    } catch (cause) {
      this.fail(cause);
    }
  }

  private finish(outcome: ImageWaitResult['outcome']): void {
    if (this.finished) return;
    try {
      this.options.signal?.throwIfAborted();
      const receipts = this.ids.map((id) => this.options.read(id));
      const allFinished = receipts.every(terminal);
      const result: ImageWaitResult = {
        outcome: allFinished ? 'finished' : outcome,
        all_finished: allFinished,
        operations: receipts.map(resultOf),
      };
      this.cleanup();
      this.resolve(result);
    } catch (cause) {
      this.fail(cause);
    }
  }

  private fail(cause: unknown): void {
    if (this.finished) return;
    this.cleanup();
    this.reject(cause);
  }

  private cleanup(): void {
    this.finished = true;
    this.unsubscribe();
    clearTimeout(this.timeout);
    this.options.signal?.removeEventListener('abort', this.aborted);
  }
}

function terminal(receipt: ImageOperationReceipt): boolean {
  return receipt.state !== 'reserved' && receipt.state !== 'running';
}

function resultOf(receipt: ImageOperationReceipt): ImageWaitResult['operations'][number] {
  const available =
    receipt.state === 'completed' && receipt.message_deleted !== true && receipt.results.length > 0;
  return {
    id: receipt.id,
    state: receipt.state,
    reason: receipt.reason,
    result_available: available,
    results: available ? receipt.results : [],
  };
}
