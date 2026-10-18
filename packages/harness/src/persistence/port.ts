import type { DshWriterClaim } from '@smarteverything/domain';
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent } from '@deepseek-ai/dsh-session';

export interface NativeSessionSnapshot {
  readonly header: unknown;
  readonly inheritedEventCount: number;
  readonly eventCount: number;
  readonly revision: string;
}

export interface NativeSessionRange {
  readonly offset: number;
  readonly length?: number;
}

export interface NativeSessionWriter extends NativeSessionSnapshot {
  readonly claim: DshWriterClaim;
}

export interface NativeSessionPersistencePort {
  create(
    header: SessionHeader,
    inheritedEventCount: number,
    signal?: AbortSignal,
  ): Promise<NativeSessionWriter>;
  acquire(id: SessionId, signal?: AbortSignal): Promise<NativeSessionWriter>;
  stat(id: SessionId, signal?: AbortSignal): Promise<NativeSessionSnapshot | undefined>;
  list(signal?: AbortSignal): Promise<readonly NativeSessionSnapshot[]>;
  read(id: SessionId, range?: NativeSessionRange, signal?: AbortSignal): Promise<unknown>;
  append(
    claim: DshWriterClaim,
    operationId: string,
    events: readonly SessionEvent[],
  ): Promise<void>;
  flush(claim: DshWriterClaim, expectedNextSeq: number): Promise<void>;
  onOwnershipLost(listener: (id: string) => void): () => void;
}
