import { HarnessReducer } from '@smarteverything/harness/reducer';
import type { SessionOpening } from '@smarteverything/harness/reducer';
import { Logger } from '@smarteverything/logging';
import { ApiError } from '@smarteverything/domain';
import type {
  AiHarnessEvent,
  DshSessionMetadata,
  HarnessNativeFrame,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export class NativeIngest {
  private readonly log = new Logger('hub.harness');
  private readonly reducer = new HarnessReducer({
    metadata: (id): DshSessionMetadata => this.metadata(id),
    opening: (id): SessionOpening => this.opening(id),
  });

  constructor(
    private readonly store: Store,
    private readonly publish: (event: AiHarnessEvent) => void,
  ) {}

  frame(frame: HarnessNativeFrame): void {
    for (const event of this.reducer.apply(frame)) this.publish(event);
  }

  appended(sessionId: string, events: readonly unknown[]): void {
    for (const event of events) {
      try {
        for (const published of this.reducer.append(sessionId, event)) this.publish(published);
      } catch (cause) {
        this.log.error('ingest.failed', cause, { session_id: sessionId });
      }
    }
  }

  private profile(id: string): string {
    const grant = this.store.harnessCoordination.grant(id);
    if (grant === undefined)
      throw new ApiError('forbidden', 'This native session has no active conversation grant.');
    return grant.profile_id;
  }

  private metadata(id: string): DshSessionMetadata {
    const metadata = this.store.dshSessions.stat(id, this.profile(id));
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native session metadata is unavailable.');
    return metadata;
  }

  private opening(id: string): SessionOpening {
    const session = this.store.harnessCoordination.state(id);
    if (session === undefined)
      throw new ApiError('conflict', 'Native session projection is unavailable.');
    return { session, history: this.history(id) };
  }

  private history(id: string): readonly unknown[] {
    return this.store.dshSessions.readAll(id, this.profile(id));
  }
}
