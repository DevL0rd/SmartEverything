import { randomUUID } from 'node:crypto';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import { DSH_SESSION_ID, type DshWriterClaim } from '@smarteverything/domain';
import type {
  NativeSessionPersistencePort,
  NativeSessionRange,
  NativeSessionSnapshot,
  NativeSessionWriter,
} from '../../src/persistence/port';

export class StoredSession {
  readonly events: SessionEvent[] = [];
  claim: DshWriterClaim | null = null;
  private epoch = 0;

  constructor(
    readonly header: SessionHeader,
    readonly inherited: number,
  ) {}

  snapshot(): NativeSessionSnapshot {
    return {
      header: structuredClone(this.header),
      inheritedEventCount: this.inherited,
      eventCount: this.events.length,
      revision: `revision-${String(this.events.length)}`,
    };
  }

  claimFor(target: DshWriterClaim['target']): DshWriterClaim {
    this.epoch += 1;
    this.claim = {
      session_id: DSH_SESSION_ID.parse(this.header.id),
      target,
      runtime_instance: randomUUID(),
      connection_generation: randomUUID(),
      epoch: this.epoch,
    };
    return this.claim;
  }
}

export class MemoryPersistence implements NativeSessionPersistencePort {
  readonly sessions = new Map<string, StoredSession>();
  private readonly listeners = new Set<(id: string) => void>();

  create(header: SessionHeader, inheritedEventCount: number): Promise<NativeSessionWriter> {
    const stored = new StoredSession(header, inheritedEventCount);
    this.sessions.set(header.id, stored);
    return Promise.resolve(this.writer(stored));
  }

  acquire(id: SessionId): Promise<NativeSessionWriter> {
    return Promise.resolve(this.writer(this.stored(id)));
  }

  stat(id: SessionId): Promise<NativeSessionSnapshot | undefined> {
    return Promise.resolve(this.sessions.get(id)?.snapshot());
  }

  list(): Promise<readonly NativeSessionSnapshot[]> {
    return Promise.resolve([...this.sessions.values()].map((stored) => stored.snapshot()));
  }

  read(id: SessionId, range?: NativeSessionRange): Promise<unknown> {
    const events = this.stored(id).events;
    const offset = range?.offset ?? 0;
    const end = range?.length === undefined ? events.length : offset + range.length;
    return Promise.resolve(structuredClone(events.slice(offset, end)));
  }

  append(
    claim: DshWriterClaim,
    _operationId: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    this.stored(SessionId(claim.session_id)).events.push(...structuredClone(events));
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  onOwnershipLost(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  loseOwnership(id: string): void {
    for (const listener of this.listeners) listener(id);
  }

  events(id: string): readonly SessionEvent[] {
    return this.stored(SessionId(id)).events;
  }

  protected stored(id: SessionId): StoredSession {
    const stored = this.sessions.get(id);
    if (stored === undefined) throw new Error(`Unknown session ${id}.`);
    return stored;
  }

  private writer(stored: StoredSession): NativeSessionWriter {
    return { ...stored.snapshot(), claim: stored.claimFor({ kind: 'server' }) };
  }
}
