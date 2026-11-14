import { Logger } from '@smarteverything/logging';
import { HarnessRuntimeError } from './errors';

const log = new Logger('hub.harness');

export class SessionDurability {
  private closed = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly id: string,
    private readonly barrier: () => Promise<boolean>,
  ) {}

  flush(): Promise<void> {
    return this.serialized(() => this.flushNow());
  }

  close(finish: () => Promise<void>): Promise<void> {
    return this.serialized(finish);
  }

  finalized(): void {
    this.closed = true;
  }

  private serialized(operation: () => Promise<void>): Promise<void> {
    const next = this.tail.then(operation, operation);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async flushNow(): Promise<void> {
    if (this.closed) {
      log.debug('session.flush_after_close', { session_id: this.id });
      return;
    }
    if (!(await this.barrier()))
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        'The native session is no longer registered for its durability barrier.',
        this.id,
      );
  }
}
