import {
  MessageError,
  REQUEST_OPS,
  REQUEST_OP_NAMES,
  isRequestName,
  opNameOf,
  type DriveMountErrorName,
  type Frame,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import { background, messageOf, type Logger } from '@smarteverything/logging';
import { PosixError, posixErrorOf } from '../posix/errors';
import type { Store } from '../../store/store';
import { BenchProbe } from './bench-probe';
import { errorFrame } from './frames';
import type { Executor, Executors } from './operation';
import type { MountLink, MountSession } from './session';
import { withPathScope } from '../paths';

export interface Failure {
  readonly code: DriveMountErrorName;
  readonly message: string;
  readonly rev?: number;
}

function failureOf(cause: unknown, log: Logger, op: string): Failure {
  if (cause instanceof MessageError) return { code: 'EINVAL', message: cause.message };
  const known = posixErrorOf(cause);
  if (known instanceof PosixError) {
    return known.rev === undefined
      ? { code: known.code, message: known.message }
      : { code: known.code, message: known.message, rev: known.rev };
  }
  log.error('drive_mount.operation_failed', cause, { op });
  return { code: 'EIO', message: messageOf(cause) };
}

interface Prepared {
  readonly session: MountSession;
  readonly link: MountLink;
  readonly frame: Frame;
  readonly name: RequestOpName;
  readonly executor: Executor;
}

export class Dispatch {
  private readonly probe = BenchProbe.fromEnvironment();

  constructor(
    private readonly executors: Executors,
    private readonly log: Logger,
    private readonly store: Store,
  ) {}

  complete(): readonly RequestOpName[] {
    return REQUEST_OP_NAMES.filter((name) => name !== 'HELLO' && this.executors[name] === undefined);
  }

  handle(session: MountSession, link: MountLink, frame: Frame): void {
    const name = opNameOf(frame.op);
    if (frame.type !== 'request' || name === undefined || !isRequestName(name)) {
      link.send(
        errorFrame(frame.op, frame.requestId, {
          code: 'EINVAL',
          message: 'That is not a request.',
        }),
      );
      return;
    }
    const executor = this.executors[name];
    if (executor === undefined || REQUEST_OPS[name].requestPayload !== (frame.payload !== null)) {
      link.send(
        errorFrame(frame.op, frame.requestId, {
          code: 'EINVAL',
          message: `${name} cannot be answered this way.`,
        }),
      );
      return;
    }
    const run = this.runner({ session, link, frame, name, executor });
    if (REQUEST_OPS[name].lane === 'mutation') {
      this.enqueue(session, { name, meta: frame.meta }, run);
    } else {
      background(run(), 'drive_mount.operation_failed');
    }
  }

  private runner(call: Prepared): () => Promise<void> {
    const { session, link, frame, name, executor } = call;
    const probe = this.probe;
    if (probe === null) return () => this.execute(session, link, frame, executor);
    const arrived = performance.now();
    return async () => {
      const started = performance.now();
      await this.execute(session, link, frame, executor);
      probe.record(name, started - arrived, performance.now() - started);
    };
  }

  private enqueue(
    session: MountSession,
    request: { readonly name: RequestOpName; readonly meta: Uint8Array },
    run: () => Promise<void>,
  ): void {
    const handled = this.probe?.enqueue({ store: this.store, session, ...request }, run);
    if (handled !== true) session.enqueue(run);
  }

  private async execute(
    session: MountSession,
    link: MountLink,
    frame: Frame,
    executor: Executor,
  ): Promise<void> {
    let bytes: Uint8Array;
    try {
      bytes = await withPathScope(() =>
        executor({
          session,
          requestId: frame.requestId,
          meta: frame.meta,
          payload: frame.payload,
          cancellable: (cancel) => {
            session.inflight.set(frame.requestId, { cancel });
          },
        }),
      );
    } catch (cause) {
      bytes = errorFrame(frame.op, frame.requestId, failureOf(cause, this.log, String(frame.op)));
    } finally {
      session.inflight.delete(frame.requestId);
    }
    this.reply(session, link, bytes);
  }

  private reply(session: MountSession, link: MountLink, bytes: Uint8Array): void {
    if (session.link !== link) return;
    try {
      link.send(bytes);
    } catch (cause) {
      this.log.warn('drive_mount.reply_failed', { reason: messageOf(cause) });
    }
  }
}
