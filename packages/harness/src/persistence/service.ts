import { HarnessRuntimeError } from '../host/errors';
import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import { DSH_WRITER_CLAIM } from '@smarteverything/domain';
import { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { SessionHeader } from '@deepseek-ai/dsh-session';
import {
  materializeCreateHeader,
  SessionAlreadyOwnedError,
  SessionPersistence,
  SessionPersistenceNotFoundError,
  SessionPersistenceRevision,
} from '@deepseek-ai/dsh-session-persistence';
import type {
  SessionAccess,
  SessionHandle,
  SessionPersistenceCreateOptions,
  SessionPersistenceListOptions,
  SessionPersistenceOpenOptions,
  SessionPersistenceSnapshot,
  SessionPersistenceStatOptions,
} from '@deepseek-ai/dsh-session-persistence';
import type {
  NativeSessionPersistencePort,
  NativeSessionSnapshot,
  NativeSessionWriter,
} from './port';
import { MachineSessionHandle } from './handle';
import { boundHeader, nativeHeader } from './validation';

export class MachineSessionPersistence extends SessionPersistence {
  private readonly handles = new Set<MachineSessionHandle>();
  private readonly writers = new Map<string, MachineSessionHandle>();
  private readonly opening = new Set<string>();

  constructor(
    ctx: Context,
    private readonly port: NativeSessionPersistencePort,
  ) {
    super(ctx);
    ctx.on('session/event', (session, event) => this.writers.get(session.id)?.route(event));
    ctx.on('session/flush', (session) => this.writers.get(session.id)?.flush());
    const unsubscribe = port.onOwnershipLost((id) => this.writers.get(id)?.loseOwnership());
    ctx.effect((): (() => Promise<void>) => async (): Promise<void> => {
      unsubscribe();
      await this.closeAll();
    });
  }

  create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle> {
    const materialized = materializeCreateHeader(header);
    const inherited = options?.inheritedEventCount ?? SessionLogOffset(0);
    if (!header.isSeeded && inherited !== 0)
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${header.id} has an inherited prefix without fork lineage.`,
      );
    if (header.isSeeded && options?.inheritedEventCount === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${header.id} requires its exact inherited prefix.`,
      );
    return this.writeOpen(header.id, () =>
      this.port.create(materialized, inherited, options?.signal),
    );
  }

  async open(
    id: SessionId,
    access: SessionAccess,
    options?: SessionPersistenceOpenOptions,
  ): Promise<SessionHandle> {
    if (access === 'write') return this.writeOpen(id, () => this.port.acquire(id, options?.signal));
    const snapshot = await this.port.stat(id, options?.signal);
    if (snapshot === undefined) throw new SessionPersistenceNotFoundError(id);
    return this.track(snapshot, boundHeader(id, snapshot.header));
  }

  async stat(
    id: SessionId,
    options?: SessionPersistenceStatOptions,
  ): Promise<SessionPersistenceSnapshot | undefined> {
    const snapshot = await this.port.stat(id, options?.signal);
    return snapshot === undefined
      ? undefined
      : { ...this.snapshot(snapshot), header: boundHeader(id, snapshot.header) };
  }

  async list(
    options?: SessionPersistenceListOptions,
  ): Promise<readonly SessionPersistenceSnapshot[]> {
    return (await this.port.list(options?.signal)).map((snapshot) => this.snapshot(snapshot));
  }

  async flush(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.writers.values()].map((handle) => handle.flush()),
    );
    this.assertSettled(results, 'flush');
  }

  owned(id: string): boolean {
    return this.writers.get(id)?.owned() === true;
  }

  finalize(id: string): Promise<void> {
    return this.writers.get(id)?.close() ?? Promise.resolve();
  }

  finalizationFailure(id: string, error: unknown): boolean {
    return this.writers.get(id)?.finalizationFailure(error) === true;
  }

  private async writeOpen(
    id: SessionId,
    acquire: () => Promise<NativeSessionWriter>,
  ): Promise<SessionHandle> {
    if (this.writers.has(id) || this.opening.has(id)) throw new SessionAlreadyOwnedError(id);
    this.opening.add(id);
    try {
      const writer = await acquire();
      return this.track(writer, boundHeader(id, writer.header), writer);
    } finally {
      this.opening.delete(id);
    }
  }

  private track(
    snapshot: NativeSessionSnapshot,
    header: SessionHeader,
    writer?: NativeSessionWriter,
  ): MachineSessionHandle {
    z.object({
      inheritedEventCount: z.int().nonnegative(),
      eventCount: z.int().nonnegative(),
      revision: z.string().min(1),
    }).parse(snapshot);
    const claim = writer === undefined ? undefined : DSH_WRITER_CLAIM.parse(writer.claim);
    if (claim !== undefined && SessionId(claim.session_id) !== header.id)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Writer claim does not belong to the requested session.',
        header.id,
      );
    const handle = new MachineSessionHandle(this.port, {
      header,
      inheritedEventCount: snapshot.inheritedEventCount,
      eventCount: snapshot.eventCount,
      ...(claim === undefined ? {} : { claim }),
      closed: (): void => {
        this.handles.delete(handle);
        if (writer !== undefined) this.writers.delete(header.id);
      },
    });
    this.handles.add(handle);
    if (writer !== undefined) this.writers.set(header.id, handle);
    return handle;
  }

  private snapshot(snapshot: NativeSessionSnapshot): SessionPersistenceSnapshot {
    return {
      header: nativeHeader(snapshot.header),
      formatStatus: 'current',
      revision: SessionPersistenceRevision(snapshot.revision),
      eventCount: snapshot.eventCount,
    };
  }

  private async closeAll(): Promise<void> {
    this.assertSettled(
      await Promise.allSettled([...this.handles].map((handle) => handle.close())),
      'close',
    );
  }

  private assertSettled(results: readonly PromiseSettledResult<void>[], operation: string): void {
    const errors: unknown[] = [];
    for (const result of results) {
      if (result.status === 'rejected') errors.push(result.reason);
    }
    if (errors.length > 0)
      throw new AggregateError(errors, `Native session persistence ${operation} failed.`);
  }
}
