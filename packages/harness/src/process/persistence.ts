import {
  DSH_SESSION_METADATA,
  DSH_SESSION_PAGE,
  DSH_WRITER_CLAIM,
  DSH_SESSION_EVENTS_WRITE,
} from '@smarteverything/domain';
import type {
  DshWriterClaim,
  DshSessionMetadata,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import type { SessionId, SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session';
import type {
  NativeSessionPersistencePort,
  NativeSessionSnapshot,
  NativeSessionWriter,
} from '../persistence/port';
import { HarnessRuntimeError } from '../host/errors';
import { Logger } from '@smarteverything/logging';
import type { HarnessHttp } from './http';

const LEASE_MS = 120_000;
const RENEW_MS = 40_000;
export class HttpHarnessPersistence implements NativeSessionPersistencePort {
  private readonly claims = new Map<string, DshWriterClaim>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  constructor(private readonly http: HarnessHttp) {}

  bind(claim: DshWriterClaim): void {
    this.claims.set(claim.session_id, DSH_WRITER_CLAIM.parse(claim));
    this.arm(claim.session_id);
  }
  create(_header: SessionHeader, _inheritedEventCount: number): Promise<NativeSessionWriter> {
    return Promise.reject(
      new HarnessRuntimeError(
        'ownership_lost',
        'Native creation requires an explicit central chat grant.',
      ),
    );
  }
  async acquire(id: SessionId, signal?: AbortSignal): Promise<NativeSessionWriter> {
    const claim = this.claim(id);
    await this.verify(claim);
    return { ...snapshot(await this.metadata(id, signal)), claim };
  }
  async stat(id: SessionId, signal?: AbortSignal): Promise<NativeSessionSnapshot> {
    return snapshot(await this.metadata(id, signal));
  }
  async list(): Promise<readonly NativeSessionSnapshot[]> {
    return Promise.all(
      [...this.claims.keys()].map(async (id) => snapshot(await this.metadata(id))),
    );
  }
  async read(id: SessionId, signal?: AbortSignal): Promise<unknown> {
    const events: unknown[] = [];
    let offset = 0;
    let next = true;
    while (next) {
      const page = await this.http.call(
        {
          operation: 'read',
          input: {
            session_id: DSH_SESSION_METADATA.shape.header.shape.id.parse(id),
            offset,
            limit: 10_000,
          },
        },
        DSH_SESSION_PAGE,
        signal,
      );
      events.push(...page.events);
      if (page.next_offset === null) {
        next = false;
      } else {
        offset = page.next_offset;
      }
    }
    return events;
  }
  async append(
    claim: DshWriterClaim,
    operationId: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    await this.http.call(
      {
        operation: 'append',
        input: {
          claim: this.claim(claim.session_id),
          operation_id: operationId,
          events: DSH_SESSION_EVENTS_WRITE.parse(events),
        },
      },
      DSH_SESSION_METADATA,
    );
  }
  async flush(claim: DshWriterClaim, expectedNextSeq: number): Promise<void> {
    await this.http.call(
      {
        operation: 'flush',
        input: { claim: this.claim(claim.session_id), expected_next_seq: expectedNextSeq },
      },
      DSH_SESSION_METADATA,
    );
  }
  async release(
    claim: DshWriterClaim,
    operationId: string,
    expectedNextSeq: number,
  ): Promise<void> {
    await this.http.call(
      {
        operation: 'release',
        input: {
          claim: this.claim(claim.session_id),
          operation_id: operationId,
          expected_next_seq: expectedNextSeq,
        },
      },
      DSH_SESSION_METADATA,
    );
    this.forget(claim.session_id);
  }
  onOwnershipLost(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  verify(claim: DshWriterClaim, subscription?: HarnessSubscriptionUse): Promise<DshWriterClaim> {
    return this.http.call(
      { operation: 'verify', claim, ...(subscription === undefined ? {} : { subscription }) },
      DSH_WRITER_CLAIM,
    );
  }
  lose(id: string): void {
    this.forget(id);
    for (const listener of this.listeners) listener(id);
  }
  boundClaim(id: string): DshWriterClaim | undefined {
    return this.claims.get(id);
  }
  claim(id: string): DshWriterClaim {
    const claim = this.claims.get(id);
    if (claim === undefined || Date.parse(claim.expires_at) <= Date.now())
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Central writer authority is unavailable.',
        id,
      );
    return claim;
  }
  metadata(id: string, signal?: AbortSignal): Promise<DshSessionMetadata> {
    return this.http.call(
      { operation: 'stat', session_id: DSH_SESSION_METADATA.shape.header.shape.id.parse(id) },
      DSH_SESSION_METADATA,
      signal,
    );
  }
  private forget(id: string): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.claims.delete(id);
  }
  private arm(id: string): void {
    clearTimeout(this.timers.get(id));
    const timer = setTimeout(() => {
      void this.renew(id);
    }, RENEW_MS);
    timer.unref();
    this.timers.set(id, timer);
  }
  private async renew(id: string): Promise<void> {
    try {
      const claim = await this.http.call(
        { operation: 'renew', input: { claim: this.claim(id), lease_ms: LEASE_MS } },
        DSH_WRITER_CLAIM,
      );
      this.bind(claim);
    } catch (cause) {
      new Logger('hub.harness').warn('ownership.lost', {
        session_id: id,
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
      this.lose(id);
    }
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
