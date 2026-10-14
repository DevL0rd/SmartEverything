import { Logger } from '@smarteverything/logging';
import { ApiError } from '@smarteverything/domain';
import type { DshWriterClaim, DshSessionMetadata } from '@smarteverything/domain';
import type { HarnessControlPersistence } from '@smarteverything/harness/process';
import type { NativeSessionSnapshot, NativeSessionWriter } from '@smarteverything/harness';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { HarnessService } from './service';

export class LocalHarnessPersistence implements HarnessControlPersistence {
  private readonly claims = new Map<string, DshWriterClaim>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly log = new Logger('hub.harness');
  constructor(private readonly service: HarnessService) {
    service.store.feed.subscribe((change) => {
      if (change.table !== 'clients' && change.table !== 'profiles') return;
      for (const id of this.claims.keys()) {
        try {
          service.storage.grant(id);
        } catch (cause) {
          this.log.warn('authority.revoked', {
            session_id: id,
            error_name: cause instanceof Error ? cause.name : 'unknown',
          });
          this.lose(id);
        }
      }
    });
  }
  bind(claim: DshWriterClaim): void {
    this.claims.set(claim.session_id, claim);
    this.arm(claim.session_id);
  }
  boundClaim(id: string): DshWriterClaim | undefined {
    return this.claims.get(id);
  }
  claim(id: string): DshWriterClaim {
    const claim = this.claims.get(id);
    if (claim === undefined)
      throw new ApiError('conflict', 'This hub conversation has no active writer.');
    return claim;
  }
  create(_header: SessionHeader, _inherited: number): Promise<NativeSessionWriter> {
    return Promise.reject(
      new ApiError('forbidden', 'Hub sessions require their initiating conversation grant.'),
    );
  }
  async acquire(id: SessionId): Promise<NativeSessionWriter> {
    const claim = await this.verify(this.claim(id));
    return { ...snapshot(await this.metadata(id)), claim };
  }
  async stat(id: SessionId): Promise<NativeSessionSnapshot> {
    return snapshot(await this.metadata(id));
  }
  async list(): Promise<readonly NativeSessionSnapshot[]> {
    return Promise.all(
      [...this.claims.keys()].map(async (id) => snapshot(await this.metadata(id))),
    );
  }
  read(id: SessionId): Promise<unknown> {
    const grant = this.service.storage.grant(id);
    const metadata = this.service.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      return Promise.reject(new ApiError('not_found', 'Native session is absent.'));
    const events: unknown[] = [];
    for (let offset = 0; offset < metadata.next_seq; offset += 10_000)
      events.push(
        ...this.service.store.dshSessions.read(
          { session_id: id, offset, limit: 10_000 },
          grant.profile_id,
        ).events,
      );
    return Promise.resolve(events);
  }
  append(
    claim: DshWriterClaim,
    operationId: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    this.service.store.dshSessions.append(
      { claim, operation_id: operationId, events },
      this.principal(claim.session_id),
    );
    return Promise.resolve();
  }
  flush(claim: DshWriterClaim, expectedNextSeq: number): Promise<void> {
    this.service.store.dshSessions.flush(
      { claim, expected_next_seq: expectedNextSeq },
      this.principal(claim.session_id),
    );
    return Promise.resolve();
  }
  release(claim: DshWriterClaim, operationId: string, expectedNextSeq: number): Promise<void> {
    this.service.store.dshSessions.release(
      { claim, operation_id: operationId, expected_next_seq: expectedNextSeq },
      this.principal(claim.session_id),
    );
    clearTimeout(this.timers.get(claim.session_id));
    this.timers.delete(claim.session_id);
    this.claims.delete(claim.session_id);
    return Promise.resolve();
  }
  metadata(id: string): Promise<DshSessionMetadata> {
    const grant = this.service.storage.grant(id);
    const metadata = this.service.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native session metadata is absent.');
    return Promise.resolve(metadata);
  }
  verify(claim: DshWriterClaim): Promise<DshWriterClaim> {
    try {
      return Promise.resolve(
        this.service.store.dshSessions.verifyWriter(claim, this.principal(claim.session_id)),
      );
    } catch (cause) {
      this.lose(claim.session_id);
      return Promise.reject(
        cause instanceof Error
          ? cause
          : new ApiError(
              'conflict',
              'Native writer verification failed with an invalid error result.',
            ),
      );
    }
  }
  lose(id: string): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.claims.delete(id);
    for (const listener of this.listeners) listener(id);
  }
  onOwnershipLost(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private principal(id: string): ReturnType<HarnessService['hostPrincipal']> {
    const grant = this.service.storage.grant(id);
    const host = this.service.directory.get(grant.target).host;
    if (
      grant.target.kind !== 'server' ||
      grant.runtime_instance !== host.runtime_instance ||
      grant.generation !== host.connection_generation
    )
      throw new ApiError('forbidden', 'This hub runtime no longer owns the native conversation.');
    return this.service.hostPrincipal(grant.profile_id, host);
  }
  private arm(id: string): void {
    clearTimeout(this.timers.get(id));
    const timer = setTimeout(() => {
      try {
        this.bind(
          this.service.store.dshSessions.renew(
            { claim: this.claim(id), lease_ms: 120_000 },
            this.principal(id),
          ),
        );
      } catch (cause) {
        this.log.warn('ownership.lost', {
          session_id: id,
          error_name: cause instanceof Error ? cause.name : 'unknown',
        });
        this.lose(id);
      }
    }, 40_000);
    timer.unref();
    this.timers.set(id, timer);
  }
}
function snapshot(metadata: DshSessionMetadata): NativeSessionSnapshot {
  return {
    header: metadata.header,
    inheritedEventCount: metadata.inherited_event_count,
    eventCount: metadata.next_seq,
    revision: `${metadata.header.id}:${String(metadata.next_seq)}`,
  };
}
