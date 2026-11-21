import { HarnessReducer } from '@smarteverything/harness/reducer';
import type { SessionOpening } from '@smarteverything/harness/reducer';
import { Logger } from '@smarteverything/logging';
import type {
  AiHarnessEvent,
  DshSessionMetadata,
  HarnessNativeFrame,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { IngestRead } from './store-units';

export class NativeIngestReadError extends Error {
  override readonly name = 'NativeIngestReadError';

  constructor(readonly sessionId: string) {
    super(`Native session ${sessionId} was reduced without its stored metadata read first.`);
  }
}

export class NativeIngest {
  private readonly log = new Logger('hub.harness');
  private readonly reducer = new HarnessReducer({
    metadata: (id): DshSessionMetadata => this.read(id).metadata,
    opening: (id): SessionOpening => {
      const opening = this.read(id).opening;
      if (opening === undefined) throw new NativeIngestReadError(id);
      return opening;
    },
  });
  private readonly epochs = new Map<string, number>();
  private readonly reads = new Map<string, IngestRead>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly publish: (event: AiHarnessEvent) => Promise<void>,
  ) {}

  frame(frame: HarnessNativeFrame): Promise<void> {
    return this.queued(frame.session_id, () => this.applied(frame));
  }

  appended(sessionId: string, events: readonly unknown[]): void {
    this.queued(sessionId, () => this.appendedEvents(sessionId, events)).catch((cause: unknown) => {
      this.log.error('ingest.failed', cause, { session_id: sessionId });
    });
  }

  async settled(): Promise<void> {
    while (this.queues.size > 0) await Promise.all(this.queues.values());
  }

  private queued(sessionId: string, work: () => Promise<void>): Promise<void> {
    const next = (this.queues.get(sessionId) ?? Promise.resolve()).then(work, work);
    const settled = (): void => {
      if (this.queues.get(sessionId) === tail) this.queues.delete(sessionId);
    };
    const tail: Promise<void> = next.then(settled, settled);
    this.queues.set(sessionId, tail);
    return next;
  }

  private async applied(frame: HarnessNativeFrame): Promise<void> {
    const id = frame.session_id;
    const opening = frame.kind === 'open';
    if (!opening && (frame.kind === 'close' || this.epochs.get(id) !== frame.epoch)) {
      if (frame.kind === 'close' && this.epochs.get(id) === frame.epoch) this.epochs.delete(id);
      this.reducer.apply(frame);
      return;
    }
    const events = await this.reduced(id, opening, () => this.reducer.apply(frame));
    if (opening) this.epochs.set(id, frame.epoch);
    for (const event of events) await this.publish(event);
  }

  private async appendedEvents(sessionId: string, events: readonly unknown[]): Promise<void> {
    if (!this.epochs.has(sessionId)) return;
    this.reads.set(
      sessionId,
      await this.store.host.read('harnessIngestRead', { session_id: sessionId, opening: false }),
    );
    try {
      for (const event of events) {
        try {
          for (const published of this.reducer.append(sessionId, event))
            await this.publish(published);
        } catch (cause) {
          this.log.error('ingest.failed', cause, { session_id: sessionId });
        }
      }
    } finally {
      this.reads.delete(sessionId);
    }
  }

  private async reduced(
    sessionId: string,
    opening: boolean,
    reduce: () => readonly AiHarnessEvent[],
  ): Promise<readonly AiHarnessEvent[]> {
    this.reads.set(
      sessionId,
      await this.store.host.read('harnessIngestRead', { session_id: sessionId, opening }),
    );
    try {
      return reduce();
    } finally {
      this.reads.delete(sessionId);
    }
  }

  private read(id: string): IngestRead {
    const read = this.reads.get(id);
    if (read === undefined) throw new NativeIngestReadError(id);
    return read;
  }
}
