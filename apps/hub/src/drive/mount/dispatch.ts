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
import { messageOf, type Logger } from '@smarteverything/logging';
import { PosixError, posixErrorOf } from '../posix/errors';
import type { DriveActivity } from '../activity';
import { BenchProbe } from './bench-probe';
import { errorFrame } from './frames';
import {
  childKeys,
  claimOf,
  isMutation,
  laneMismatches,
  type Claim,
  type Earlier,
  type MutationName,
  type Resolver,
  type Resolvers,
} from './lanes';
import { MountMetrics } from './metrics';
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

interface Call {
  readonly session: MountSession;
  readonly link: MountLink;
  readonly frame: Frame;
  readonly name: RequestOpName;
  readonly executor: Executor;
  readonly arrived: number;
}

export class Dispatch {
  private readonly metrics = new MountMetrics();

  constructor(
    private readonly executors: Executors,
    private readonly log: Logger,
    private readonly resolvers: Resolvers,
    private readonly activity: DriveActivity,
  ) {
    const unordered = laneMismatches();
    if (unordered.length > 0)
      throw new Error(`The mount lanes do not match the mutation ops: ${unordered.join(', ')}.`);
    BenchProbe.startFromEnvironment(this.metrics);
  }

  get latency(): MountMetrics {
    return this.metrics;
  }

  complete(): readonly RequestOpName[] {
    return REQUEST_OP_NAMES.filter(
      (name) => name !== 'HELLO' && this.executors[name] === undefined,
    );
  }

  handle(session: MountSession, link: MountLink, frame: Frame): Promise<void> {
    const arrived = performance.now();
    const name = opNameOf(frame.op);
    if (frame.type !== 'request' || name === undefined || !isRequestName(name)) {
      link.send(
        errorFrame(frame.op, frame.requestId, {
          code: 'EINVAL',
          message: 'That is not a request.',
        }),
      );
      return Promise.resolve();
    }
    const executor = this.executors[name];
    if (executor === undefined || REQUEST_OPS[name].requestPayload !== (frame.payload !== null)) {
      link.send(
        errorFrame(frame.op, frame.requestId, {
          code: 'EINVAL',
          message: `${name} cannot be answered this way.`,
        }),
      );
      return Promise.resolve();
    }
    const call: Call = { session, link, frame, name, executor, arrived };
    return isMutation(name) ? this.ordered(call, name) : this.execute(call, null);
  }

  private ordered(call: Call, name: MutationName): Promise<void> {
    const resolver = this.resolvers(call.session);
    let claim: Claim;
    try {
      claim = claimOf(name, call.frame.meta, resolver);
    } catch (cause) {
      this.reply(
        call.session,
        call.link,
        errorFrame(call.frame.op, call.frame.requestId, failureOf(cause, this.log, name)),
      );
      return Promise.resolve();
    }
    return call.session.lanes.run(
      claim.hold,
      (earlier) =>
        this.activity.around(() =>
          this.execute(
            call,
            claim.children.length === 0
              ? null
              : (): Promise<void> => this.awaitChildren(claim, resolver, earlier),
          ),
        ),
      claim.shared,
    );
  }

  private async awaitChildren(claim: Claim, resolver: Resolver, earlier: Earlier): Promise<void> {
    await earlier(await childKeys(claim, resolver));
  }

  private async execute(call: Call, prelude: (() => Promise<void>) | null): Promise<void> {
    const { session, link, frame, executor } = call;
    let bytes: Uint8Array;
    let started = call.arrived;
    try {
      bytes = await withPathScope(async () => {
        if (prelude !== null) await prelude();
        started = performance.now();
        return executor({
          session,
          requestId: frame.requestId,
          meta: frame.meta,
          payload: frame.payload,
          cancellable: (cancel) => {
            session.inflight.set(frame.requestId, { cancel });
          },
        });
      });
    } catch (cause) {
      bytes = errorFrame(frame.op, frame.requestId, failureOf(cause, this.log, String(frame.op)));
    } finally {
      session.inflight.delete(frame.requestId);
    }
    const finished = performance.now();
    this.metrics.record(call.name, started - call.arrived, finished - started);
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
