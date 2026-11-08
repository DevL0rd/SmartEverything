import { Logger } from '@smarteverything/logging';
import { ApiError, DSH_SESSION_HEADER } from '@smarteverything/domain';
import type { DshWriterClaim, DshSessionMetadata } from '@smarteverything/domain';
import type { HarnessControlPersistence } from '@smarteverything/harness/process';
import type {
  NativeSessionRange,
  NativeSessionSnapshot,
  NativeSessionWriter,
} from '@smarteverything/harness';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { HarnessService } from './service';

export class LocalHarnessPersistence implements HarnessControlPersistence {
  private readonly claims = new Map<string, DshWriterClaim>();
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
  create(header: SessionHeader, inherited: number): Promise<NativeSessionWriter> {
    try {
      return Promise.resolve(this.createChild(header, inherited));
    } catch (cause) {
      return Promise.reject(
        cause instanceof Error
          ? cause
          : new ApiError('conflict', 'Native child creation failed with an invalid error result.'),
      );
    }
  }
  async acquire(id: SessionId): Promise<NativeSessionWriter> {
    const claim = await this.verify(this.claim(id));
    return { ...snapshot(await this.metadata(id)), claim };
  }
  async stat(id: SessionId): Promise<NativeSessionSnapshot | undefined> {
    if (this.service.store.dshSessions.ownerOf(id) === undefined) return undefined;
    return snapshot(await this.readable(id));
  }
  async list(): Promise<readonly NativeSessionSnapshot[]> {
    return Promise.all(
      [...this.claims.keys()].map(async (id) => snapshot(await this.metadata(id))),
    );
  }
  read(id: SessionId, range?: NativeSessionRange): Promise<unknown> {
    const grant = this.service.storage.grant(this.reader(id));
    return Promise.resolve(this.service.store.dshSessions.readAll(id, grant.profile_id, range));
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
  metadata(id: string): Promise<DshSessionMetadata> {
    const grant = this.service.storage.grant(id);
    const metadata = this.service.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native session metadata is absent.');
    return Promise.resolve(metadata);
  }
  private readable(id: string): Promise<DshSessionMetadata> {
    const grant = this.service.storage.grant(this.reader(id));
    const metadata = this.service.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native session metadata is absent.');
    return Promise.resolve(metadata);
  }
  private reader(id: string): string {
    return this.service.storage.reader(
      id,
      this.service.directory.get({ kind: 'server' }).host.runtime_instance,
    );
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
    this.claims.delete(id);
    for (const listener of this.listeners) listener(id);
  }
  onOwnershipLost(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private createChild(header: SessionHeader, inherited: number): NativeSessionWriter {
    const native = DSH_SESSION_HEADER.parse(header);
    const parent = native.origin === 'subagent' ? native.parentSession : undefined;
    if (parent === undefined)
      throw new ApiError('forbidden', 'Hub sessions require their initiating conversation grant.');
    const parentClaim = this.claim(parent);
    const opened = this.service.storage.adoptChild(
      native,
      inherited,
      this.principal(parent),
      parentClaim,
    );
    this.bind(opened.claim);
    return { ...snapshot(opened.metadata), claim: opened.claim };
  }
  private principal(id: string): ReturnType<HarnessService['hostPrincipal']> {
    const grant = this.service.storage.grant(id);
    const host = this.service.directory.get(grant.target).host;
    if (grant.target.kind !== 'server')
      throw new ApiError('forbidden', 'This hub runtime no longer owns the native conversation.');
    return this.service.hostPrincipal(grant.profile_id, host);
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
