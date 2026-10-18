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
  NativeSessionRange,
  NativeSessionSnapshot,
  NativeSessionWriter,
} from '../persistence/port';
import { HarnessRuntimeError } from '../host/errors';
import type { HarnessHub } from './http';

const PAGE_EVENTS = 10_000;
export class HubSessionLog implements NativeSessionPersistencePort {
  private readonly claims = new Map<string, DshWriterClaim>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly known = new Map<string, DshSessionMetadata>();
  constructor(private readonly http: HarnessHub) {}

  bind(claim: DshWriterClaim): void {
    this.claims.set(claim.session_id, DSH_WRITER_CLAIM.parse(claim));
    this.known.delete(claim.session_id);
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
    return { ...snapshot(await this.metadata(id, signal)), claim: this.claim(id) };
  }
  async stat(id: SessionId, signal?: AbortSignal): Promise<NativeSessionSnapshot> {
    return snapshot(await this.metadata(id, signal));
  }
  async list(): Promise<readonly NativeSessionSnapshot[]> {
    return Promise.all(
      [...this.claims.keys()].map(async (id) => snapshot(await this.metadata(id))),
    );
  }
  async read(id: SessionId, range?: NativeSessionRange, signal?: AbortSignal): Promise<unknown> {
    const events: unknown[] = [];
    const start = range?.offset ?? 0;
    const end = range?.length === undefined ? Infinity : start + range.length;
    let offset = start;
    while (offset < end) {
      const page = await this.http.call(
        {
          operation: 'read',
          input: {
            session_id: DSH_SESSION_METADATA.shape.header.shape.id.parse(id),
            offset,
            limit: Math.min(PAGE_EVENTS, end - offset),
          },
        },
        DSH_SESSION_PAGE,
        signal,
      );
      events.push(...page.events);
      if (page.next_offset === null) break;
      offset = page.next_offset;
    }
    return events;
  }
  async append(
    claim: DshWriterClaim,
    operationId: string,
    events: readonly SessionEvent[],
  ): Promise<void> {
    const id = claim.session_id;
    const input = {
      claim: this.claim(id),
      operation_id: operationId,
      events: DSH_SESSION_EVENTS_WRITE.parse(events),
    };
    this.remember(
      id,
      await this.fenced(id, () =>
        this.http.call({ operation: 'append', input }, DSH_SESSION_METADATA),
      ),
    );
  }
  async flush(claim: DshWriterClaim, expectedNextSeq: number): Promise<void> {
    const id = claim.session_id;
    const input = { claim: this.claim(id), expected_next_seq: expectedNextSeq };
    this.remember(
      id,
      await this.fenced(id, () =>
        this.http.call({ operation: 'flush', input }, DSH_SESSION_METADATA),
      ),
    );
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
    if (claim === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Central writer authority is unavailable.',
        id,
      );
    return claim;
  }
  async metadata(id: string, signal?: AbortSignal): Promise<DshSessionMetadata> {
    const known = this.known.get(id);
    if (known !== undefined) return known;
    const fetched = await this.http.call(
      { operation: 'stat', session_id: DSH_SESSION_METADATA.shape.header.shape.id.parse(id) },
      DSH_SESSION_METADATA,
      signal,
    );
    this.remember(id, fetched);
    return fetched;
  }
  private remember(id: string, metadata: DshSessionMetadata): void {
    if (this.claims.has(id)) this.known.set(id, metadata);
  }
  private async fenced<T>(id: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (cause) {
      if (cause instanceof HarnessRuntimeError && cause.code === 'ownership_lost') this.lose(id);
      throw cause;
    }
  }
  private forget(id: string): void {
    this.claims.delete(id);
    this.known.delete(id);
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
