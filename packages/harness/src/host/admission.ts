import { HarnessRuntimeError } from './errors';

export class HarnessAdmission {
  private accepting = true;
  private disposed = false;
  private tail: Promise<void> = Promise.resolve();
  private shutdownPending: Promise<void> | undefined;

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.accepting)
      return Promise.reject(
        new HarnessRuntimeError(
          'runtime_unavailable',
          'The harness is disposing and cannot admit new work.',
        ),
      );
    return this.schedule(operation);
  }

  cleanup(operation: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.schedule(operation);
  }

  shutdown(operation: () => Promise<void>): Promise<void> {
    this.accepting = false;
    if (this.shutdownPending !== undefined) return this.shutdownPending;
    this.shutdownPending = this.schedule(operation).then(
      () => {
        this.disposed = true;
      },
      (error: unknown) => {
        this.shutdownPending = undefined;
        throw error;
      },
    );
    return this.shutdownPending;
  }

  private schedule<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
