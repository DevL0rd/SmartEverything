import type {
  AiHarnessEvent,
  DshSessionMetadata,
  HarnessNativeFrame,
} from '@smarteverything/domain';
import { SessionReducer } from './session';
import type { SessionOpening } from './session';

export type { SessionOpening } from './session';
export { isProjectedType } from './event';

export interface ReducerPorts {
  readonly metadata: (sessionId: string) => DshSessionMetadata;
  readonly opening: (sessionId: string) => SessionOpening;
}

export class HarnessReducer {
  private readonly sessions = new Map<
    string,
    { readonly epoch: number; readonly session: SessionReducer }
  >();

  constructor(private readonly ports: ReducerPorts) {}

  apply(frame: HarnessNativeFrame): readonly AiHarnessEvent[] {
    if (frame.kind === 'open') return this.open(frame.session_id, frame.epoch);
    const open = this.sessions.get(frame.session_id);
    if (open?.epoch !== frame.epoch) return [];
    if (frame.kind !== 'close') return open.session.apply(frame.kind, frame);
    this.sessions.delete(frame.session_id);
    return [];
  }

  append(sessionId: string, event: unknown): readonly AiHarnessEvent[] {
    return this.sessions.get(sessionId)?.session.append(event) ?? [];
  }

  private open(sessionId: string, epoch: number): readonly AiHarnessEvent[] {
    const session = new SessionReducer(
      { metadata: (): DshSessionMetadata => this.ports.metadata(sessionId) },
      this.ports.opening(sessionId),
    );
    this.sessions.set(sessionId, { epoch, session });
    return session.restored();
  }
}
