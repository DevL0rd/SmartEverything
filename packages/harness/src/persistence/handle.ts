import { HarnessRuntimeError } from '../host/errors';
import { randomUUID } from 'node:crypto';
import { SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import {
  assertContiguous,
  materializeAppendBatch,
  SessionHandleClosedError,
  SessionOwnershipLostError,
  SessionReadOnlyError,
} from '@deepseek-ai/dsh-session-persistence';
import type {
  SessionAccess,
  SessionHandle,
  SessionHandleAppendOptions,
  SessionHandleFlushOptions,
  SessionHandleReadOptions,
  SessionHandleReadResult,
} from '@deepseek-ai/dsh-session-persistence';
import type { DshWriterClaim } from '@smarteverything/domain';
import type { NativeSessionPersistencePort } from './port';
import { nativeEvents } from './validation';

interface PendingAppend {
  readonly operationId: string;
  readonly events: readonly SessionEvent[];
}

export interface NativeHandleOptions {
  readonly header: SessionHeader;
  readonly inheritedEventCount: number;
  readonly eventCount: number;
  readonly claim?: DshWriterClaim;
  readonly closed: () => void;
}

export class HubSessionHandle implements SessionHandle {
  readonly id: SessionId;
  readonly header: SessionHeader;
  readonly inheritedEventCount: SessionLogOffset;
  readonly access: SessionAccess;
  private readonly pending: PendingAppend[] = [];
  private accepted: number;
  private queued: number;
  private observed: number;
  private ownershipLost = false;
  private closing: Promise<void> | undefined;
  private closeRequested = false;
  private closeFailure: unknown;
  private tail: Promise<void> = Promise.resolve();
  private readonly releaseOperation = randomUUID();

  constructor(
    private readonly port: NativeSessionPersistencePort,
    private readonly options: NativeHandleOptions,
  ) {
    this.header = options.header;
    this.id = options.header.id;
    this.inheritedEventCount = SessionLogOffset(options.inheritedEventCount);
    this.accepted = options.eventCount;
    this.queued = options.eventCount;
    this.observed = options.eventCount;
    this.access = options.claim === undefined ? 'read' : 'write';
  }

  owned(): boolean {
    return this.access === 'write' && !this.ownershipLost && !this.closeRequested;
  }

  loseOwnership(): void {
    this.ownershipLost = true;
  }

  route(event: SessionEvent): void {
    this.assertWrite('append');
    this.enqueue([event]);
  }

  async read(
    offset = 0,
    length?: number,
    options?: SessionHandleReadOptions,
  ): Promise<SessionHandleReadResult> {
    this.assertOpen('read');
    options?.signal?.throwIfAborted();
    const events = nativeEvents(this.header, await this.port.read(this.id, options?.signal));
    if (events.length < this.observed)
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${this.id} read retreated below ${String(this.observed)} events.`,
      );
    this.observed = events.length;
    return {
      eventState: 'shared-frozen',
      events: events.slice(offset, length === undefined ? undefined : offset + length),
    };
  }

  append(events: readonly SessionEvent[], options?: SessionHandleAppendOptions): Promise<void> {
    this.assertWrite('append');
    options?.signal?.throwIfAborted();
    this.enqueue(events);
    return this.serialize(() => this.drain());
  }

  flush(options?: SessionHandleFlushOptions): Promise<void> {
    this.assertWrite('flush');
    options?.signal?.throwIfAborted();
    return this.serialize(() => this.barrier());
  }

  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.closeRequested = true;
    this.closing = this.serialize(() => this.finishClose()).catch((error: unknown) => {
      this.closing = undefined;
      this.closeFailure = error;
      throw error;
    });
    return this.closing;
  }

  finalizationFailure(error: unknown): boolean {
    if (this.closeFailure === undefined) return false;
    return onlyFinalizationFailure(error, this.closeFailure);
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  private enqueue(events: readonly SessionEvent[]): void {
    const materialized = materializeAppendBatch(events);
    assertContiguous(this.id, materialized, this.queued);
    if (materialized.length === 0) return;
    this.pending.push({ operationId: randomUUID(), events: materialized });
    this.queued += materialized.length;
  }

  private async drain(): Promise<void> {
    const claim = this.claim('append');
    while (this.pending.length > 0) {
      const batch = this.pending[0];
      if (batch === undefined)
        throw new HarnessRuntimeError(
          'operation_failed',
          `Session ${this.id} append queue is inconsistent.`,
        );
      await this.port.append(claim, batch.operationId, batch.events);
      this.pending.shift();
      this.accepted += batch.events.length;
      this.observed = Math.max(this.observed, this.accepted);
    }
  }

  private async barrier(): Promise<void> {
    await this.drain();
    await this.port.flush(this.claim('flush'), this.accepted);
  }

  private async finishClose(): Promise<void> {
    if (this.access === 'write' && !this.ownershipLost) {
      await this.barrier();
      await this.port.release(this.claim('close'), this.releaseOperation, this.accepted);
    }
    this.options.closed();
  }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const next = this.tail.then(operation, operation);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private assertOpen(operation: string): void {
    if (this.closeRequested) throw new SessionHandleClosedError(this.id, operation);
  }

  private assertWrite(operation: string): void {
    this.assertOpen(operation);
    this.claim(operation);
  }

  private claim(operation: string): DshWriterClaim {
    if (this.ownershipLost) throw new SessionOwnershipLostError(this.id);
    if (this.options.claim === undefined) throw new SessionReadOnlyError(this.id, operation);
    return this.options.claim;
  }
}

function onlyFinalizationFailure(error: unknown, expected: unknown): boolean {
  if (error === expected) return true;
  if (error instanceof AggregateError) {
    const errors: readonly unknown[] = error.errors;
    return (
      errors.length > 0 && errors.every((failure) => onlyFinalizationFailure(failure, expected))
    );
  }
  if (error instanceof SuppressedError)
    return (
      onlyFinalizationFailure(error.error, expected) &&
      onlyFinalizationFailure(error.suppressed, expected)
    );
  return false;
}
