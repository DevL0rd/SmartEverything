import {
  MAX_FRAME_BYTES,
  type ReplyMeta,
  type RequestMeta,
} from '@smarteverything/domain/drive-mount';
import { background } from '@smarteverything/logging';
import type { PosixCaller } from '../posix/env';
import type { DrivePosix } from '../posix/service';
import type { HandleTable } from './handles';
import type { LockService } from './lock-service';
import type { LockSpec } from './locks';
import { MountSession, sessionKey, type MountLink } from './session';

export interface RegistryEnv {
  readonly leaseMs: number;
  readonly posix: DrivePosix;
  readonly handles: HandleTable;
  readonly locks: LockService;
}

export interface Greeting {
  readonly session: MountSession;
  readonly reply: ReplyMeta<'HELLO'>;
  readonly lost: readonly LockSpec[];
}

const CLOSE_REPLACED = 4002;

export class MountRegistry {
  private readonly sessions = new Map<string, MountSession>();

  constructor(private readonly env: RegistryEnv) {}

  all(): readonly MountSession[] {
    return [...this.sessions.values()];
  }

  ofRoot(rootId: string): readonly MountSession[] {
    return this.all().filter((session) =>
      [...session.attachments.values()].some((attachment) => attachment.scope.drive.id === rootId),
    );
  }

  hello(link: MountLink, caller: PosixCaller, request: RequestMeta<'HELLO'>): Greeting {
    const existing =
      request.session === null ? undefined : this.sessions.get(sessionKey(request.session));
    const known = existing?.nodeId === caller.nodeId ? existing : undefined;
    const session = known ?? new MountSession(caller.nodeId, caller);
    const resumed = known !== undefined;
    session.bind(link)?.close(CLOSE_REPLACED, 'Replaced by a new connection');
    session.expireIn(null);
    this.remember(session, request);
    const lost = resumed ? [] : this.env.locks.reclaim(session, request.session, request.locks);
    this.sessions.set(session.key, session);
    return {
      session,
      lost,
      reply: {
        session: session.id,
        resumed,
        leaseMs: this.env.leaseMs,
        frameLimit: MAX_FRAME_BYTES,
      },
    };
  }

  private remember(session: MountSession, request: RequestMeta<'HELLO'>): void {
    for (const entry of request.seqs) session.helperSeqs.set(entry.root, entry.seq);
    session.keepJournal(request.commits);
    for (const attachment of session.attachments.values()) {
      const seq = session.helperSeqs.get(attachment.scope.drive.id);
      if (seq !== undefined) attachment.advance(seq);
    }
  }

  detach(session: MountSession, link: MountLink): void {
    if (session.link !== link) return;
    session.bind(null);
    const timer = setTimeout(() => {
      background(this.expire(session), 'drive_mount.session_expire_failed');
    }, this.env.leaseMs);
    timer.unref();
    session.expireIn(timer);
  }

  async expire(session: MountSession): Promise<void> {
    if (session.link !== null) return;
    this.sessions.delete(session.key);
    this.env.locks.release(session);
    for (const handle of await this.env.handles.releaseAll(session)) {
      await this.env.posix.releaseOrphan(handle.scope.drive.id, handle.ino);
    }
    session.attachments.clear();
  }

  stop(): void {
    for (const session of this.sessions.values()) session.expireIn(null);
    this.sessions.clear();
  }
}
