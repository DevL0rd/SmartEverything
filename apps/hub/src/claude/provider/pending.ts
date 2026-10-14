export class ProviderCallbackError extends Error {
  override readonly name = 'ProviderCallbackError';
}

interface Waiting<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (cause: Error) => void;
  readonly remove: () => void;
}

export class ProviderPending<T> {
  private readonly waiting = new Map<string, Waiting<T>>();

  hold(id: string, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(new ProviderCallbackError('The provider request was cancelled.'));
    }
    if (this.waiting.has(id)) {
      return Promise.reject(new ProviderCallbackError('The provider callback is already waiting.'));
    }
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.reject(id, 'The provider request was cancelled.');
      };
      signal.addEventListener('abort', abort, { once: true });
      this.waiting.set(id, {
        resolve,
        reject,
        remove: () => {
          signal.removeEventListener('abort', abort);
        },
      });
    });
  }

  answer(id: string, value: T): boolean {
    const waiting = this.take(id);
    if (waiting === null) {
      return false;
    }
    waiting.resolve(value);
    return true;
  }

  stop(reason: string): void {
    for (const id of [...this.waiting.keys()]) {
      this.reject(id, reason);
    }
  }

  private reject(id: string, reason: string): void {
    this.take(id)?.reject(new ProviderCallbackError(reason));
  }

  private take(id: string): Waiting<T> | null {
    const waiting = this.waiting.get(id);
    if (waiting === undefined) {
      return null;
    }
    this.waiting.delete(id);
    waiting.remove();
    return waiting;
  }
}
