import { ApiError } from '@smarteverything/domain';

const ACTIVE_WORK_LIMIT = 64;
export class ReferenceLifecycle {
  private readonly controller = new AbortController();
  private readonly pending = new Set<Promise<void>>();
  get signal(): AbortSignal {
    return this.controller.signal;
  }
  validate(): void {
    this.signal.throwIfAborted();
  }
  begin(): () => void {
    this.validate();
    if (this.pending.size >= ACTIVE_WORK_LIMIT)
      throw new ApiError(
        'conflict',
        'The bounded reference work queue is full; try again when current work finishes.',
      );
    let release: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    if (release === undefined)
      throw new ApiError('internal', 'Reference work did not initialize its completion gate.');
    const finish = release;
    this.pending.add(done);
    return (): void => {
      finish();
      this.pending.delete(done);
    };
  }
  async close(): Promise<void> {
    this.controller.abort(new ApiError('conflict', 'The reference service is closed.'));
    await Promise.all([...this.pending]);
  }
}
