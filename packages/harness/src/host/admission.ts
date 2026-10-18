import { HarnessRuntimeError } from './errors';
import { background } from '@smarteverything/logging';

const SHARED_LANE = 'shared';

export class HarnessAdmission {
  private accepting = true;
  private disposed = false;
  private readonly lanes = new Map<string, Promise<void>>();
  private shutdownPending: Promise<void> | undefined;

  run<T>(operation: () => Promise<T>, lane: string = SHARED_LANE): Promise<T> {
    if (!this.accepting)
      return Promise.reject(
        new HarnessRuntimeError(
          'runtime_unavailable',
          'The harness is disposing and cannot admit new work.',
        ),
      );
    return this.schedule(lane, operation);
  }

  cleanup(operation: () => Promise<void>, lane: string = SHARED_LANE): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.shutdownPending !== undefined) return this.shutdownPending;
    return this.schedule(lane, operation);
  }

  shutdown(operation: () => Promise<void>): Promise<void> {
    this.accepting = false;
    if (this.shutdownPending !== undefined) return this.shutdownPending;
    const settled = Promise.allSettled([...this.lanes.values()]);
    this.shutdownPending = settled.then(operation).then(
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

  private schedule<T>(lane: string, operation: () => Promise<T>): Promise<T> {
    const before =
      lane === SHARED_LANE
        ? [...this.lanes.values()]
        : [...this.lanes]
            .filter(([key]) => key === SHARED_LANE || key === lane)
            .map(([, tail]) => tail);
    const next = Promise.allSettled(before).then(operation);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    this.lanes.set(lane, settled);
    background(
      settled.then(() => {
        if (this.lanes.get(lane) === settled) this.lanes.delete(lane);
      }),
      'admission.background_failed',
    );
    return next;
  }
}
