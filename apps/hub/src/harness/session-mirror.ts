import type { LiveChange } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { authorityScope } from '../assistant/turn-authority';
import type { Store } from '../store/store';
import type { MirroredSession } from './store-units';

export class HarnessSessionNotMirroredError extends Error {
  override readonly name = 'HarnessSessionNotMirroredError';

  constructor(readonly sessionId: string) {
    super(`Native session ${sessionId} was used by the hub runtime before it was loaded.`);
  }
}

type Entry =
  | { readonly ok: true; readonly session: MirroredSession }
  | { readonly ok: false; readonly failure: unknown };

export class HarnessSessionMirror {
  private readonly log = new Logger('hub.harness');
  private readonly entries = new Map<string, Entry>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly queued = new Map<string, Promise<void>>();

  constructor(private readonly store: Store) {
    store.feed.subscribe((change) => {
      this.changed(change);
    });
  }

  async load(id: string): Promise<MirroredSession> {
    const session = await this.read(id);
    this.entries.set(id, { ok: true, session });
    return session;
  }

  read(id: string): Promise<MirroredSession> {
    return this.store.host.write('harnessMirrorIssue', { id, scope: authorityScope() });
  }

  get(id: string): MirroredSession {
    const entry = this.entries.get(id);
    if (entry === undefined) throw new HarnessSessionNotMirroredError(id);
    if (!entry.ok) throw entry.failure;
    return entry.session;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  forget(id: string): void {
    this.entries.delete(id);
  }

  refresh(id: string): Promise<void> {
    if (!this.entries.has(id)) return Promise.resolve();
    const queued = this.queued.get(id);
    if (queued !== undefined) return queued;
    const current = this.running.get(id);
    if (current !== undefined) {
      const next = current.then(() => {
        this.queued.delete(id);
        return this.refresh(id);
      });
      this.queued.set(id, next);
      return next;
    }
    const work = this.reloaded(id).finally(() => {
      this.running.delete(id);
    });
    this.running.set(id, work);
    return work;
  }

  private async reloaded(id: string): Promise<void> {
    try {
      const session = await this.store.host.read('harnessMirrorRead', id);
      if (!this.entries.has(id)) return;
      if (session.grant.event_id !== null && session.authority === undefined) await this.load(id);
      else this.entries.set(id, { ok: true, session });
    } catch (failure) {
      if (!this.entries.has(id)) return;
      this.log.warn('session_mirror.revoked', {
        session_id: id,
        error_name: failure instanceof Error ? failure.name : 'unknown',
      });
      this.entries.set(id, { ok: false, failure });
    }
  }

  private refreshing(id: string): void {
    background(this.refresh(id), 'session_mirror.refresh_failed', { session_id: id });
  }

  private changed(change: LiveChange): void {
    if (change.table === 'clients' || change.table === 'profiles') {
      for (const id of this.entries.keys()) this.refreshing(id);
      return;
    }
    if (change.table !== 'ai_chats') return;
    const chats = new Set([change.record?.id, change.oldRecord?.id]);
    for (const [id, entry] of this.entries)
      if (!entry.ok || chats.has(entry.session.chat.id)) this.refreshing(id);
  }
}
