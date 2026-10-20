import {
  API_ENDPOINTS as E,
  LIVE_TABLES,
  type LiveChange,
  type LiveMessage,
  type LiveTable,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api, connectionRefused, type ServerConnection } from '../api/transport';
import { noticeTo } from './live-notices';
import { platformStreams } from './live-streams';
import type { EntityStore } from './entity-store';
import { loadOwnerConsents } from './live-consents';
import { attachWatches, detachWatches } from './live-watches';
import { rejectedTables } from './live-subscription';
import { UnreadableChangeError } from './live-reducers';
import { TOKEN_WITHDRAWN, backoffOf, openLiveSocket, type Received } from './live-socket';
import { rawErrorText } from '../format/errors';
import type { LiveSyncHooks } from './live-sync-hooks';
export type { LiveSyncHooks } from './live-sync-hooks';
import { routeFor } from '../api/connection/active-route';
import { followLiveRouteReadiness } from './live-route-readiness';
import { recordNotice } from '../dev/frame-probe';
import { RearmTimer } from '../design/rearm-timer';
import { LogTally, logEnabled } from '../design/log-tally';

const log = new Logger('app.live');
const SNAPSHOT_ROOTS: readonly string[] = ['tables', 'owner'];
const SNAPSHOT_REQUEST = {
  query: { nutrition: true, watch: true, weather: true, talk: true, assistant: true },
};
export const LINK_DEADLINE_MS = 20_000;
type Phase = 'closed' | 'buffering' | 'live';
const traffic = new LogTally(log, 'live.summarised', 5000);
type ActivityNotice = Extract<LiveMessage, { type: 'chat_activity' | 'chat_stream' }>;

export class LiveSync {
  private readonly snapshotCommands: NonNullable<LiveSyncHooks['onSnapshotCommands']>;
  private retryRoute: (() => boolean) | null = null;
  private stopRoute: (() => void) | null = null;
  private socketRun = 0;
  private stopSocket: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly deadline = new RearmTimer(() => {
    this.timedOut();
  });
  private attempt = 0;
  private phase: Phase = 'closed';
  private buffer: LiveChange[] = [];
  private activityBuffer: ActivityNotice[] = [];
  private batch: LiveChange[] = [];
  private snapshotRun = 0;
  private outdated: ReadonlySet<string> = new Set();
  private unsupportedTables: ReadonlySet<string> = new Set();
  private sentTables: readonly LiveTable[] = [];
  private suspended = false;
  private phaseSince = Date.now();

  constructor(
    private readonly connection: ServerConnection,
    private readonly store: EntityStore,
    private readonly hooks: LiveSyncHooks,
  ) {
    this.snapshotCommands = hooks.onSnapshotCommands ?? ((): void => undefined);
  }

  private ids(): Record<string, unknown> {
    return {
      phase: this.phase,
      socketRun: this.socketRun,
      snapshotRun: this.snapshotRun,
      attempt: this.attempt,
      buffered: this.buffer.length,
    };
  }

  private enter(next: Phase): void {
    if (next === this.phase) return;
    const now = Date.now();
    log.info('live.phase_changed', { ...this.ids(), to: next, afterMs: now - this.phaseSince });
    this.phaseSince = now;
    this.phase = next;
  }

  start(): void {
    log.info('live.starting', this.ids());
    const manager = routeFor(this.connection);
    let generation = manager.state.get().generation;
    this.stopRoute = manager.state.subscribe(() => {
      const next = manager.state.get().generation;
      if (next === generation || this.suspended || !manager.running) return;
      log.info('live.route_changed', { ...this.ids(), from: generation, to: next });
      generation = next;
      this.stopSocket?.();
      this.socketRun += 1;
      this.snapshotRun += 1;
      if (this.retry !== null) clearTimeout(this.retry);
      this.retry = null;
      this.open();
    });
    this.retryRoute = followLiveRouteReadiness(manager, {
      generation: (): number => this.socketRun,
      active: (): boolean => !this.suspended && this.stopRoute !== null,
      ready: (): void => {
        log.info('live.route_ready', this.ids());
        this.open();
      },
      failed: (error): void => {
        log.error('live.route_failed', error, this.ids());
        this.store.setSync({ status: 'interrupted', problem: rawErrorText(error) });
      },
    });
  }

  stop(): void {
    log.info('live.stopping', this.ids());
    this.retryRoute = null;
    this.stopRoute?.();
    this.stopRoute = null;
    this.socketRun += 1;
    this.batch = [];
    this.activityBuffer = [];
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    this.deadline.cancel();
    this.enter('closed');
    this.snapshotRun += 1;
    this.stopSocket?.();
    this.stopSocket = null;
    detachWatches();
  }

  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.attempt = 0;
    this.stop();
    this.store.setSync({ status: 'interrupted', problem: null });
    log.info('live.suspended');
  }

  resume(): boolean {
    if (!this.suspended) return false;
    this.suspended = false;
    log.info('live.resumed');
    routeFor(this.connection).refresh();
    this.start();
    return true;
  }

  online(): void {
    log.info('live.online_hint', { ...this.ids(), retryPending: this.retry !== null });
    if (!this.suspended && this.retryRoute?.() === true) return;
    if (!this.suspended && this.retry !== null) {
      clearTimeout(this.retry);
      this.open();
    }
  }

  refresh(): void {
    if (this.suspended || this.phase !== 'live') return;
    log.info('live.refresh_requested', this.ids());
    this.resnapshot(this.store.get().sync.problem);
  }

  private open(): void {
    this.socketRun += 1;
    const socketRun = this.socketRun;
    this.retry = null;
    this.enter('buffering');
    this.buffer = [];
    this.activityBuffer = [];
    this.store.setSync({ status: this.store.get().loaded ? 'interrupted' : 'connecting' });
    log.info('live.opening', { ...this.ids(), loaded: this.store.get().loaded });
    this.deadline.rearm(LINK_DEADLINE_MS);
    this.stopSocket = openLiveSocket(
      {
        url: this.connection.url,
        token: this.connection.token,
        subscribe: {
          type: 'subscribe',
          tables: this.subscriptionTables(),
          streams: [...platformStreams()],
        },
      },
      {
        onOpen: (send) => {
          log.debug('live.opened', { attempt: this.attempt });
          if (socketRun === this.socketRun) {
            attachWatches(send);
          }
        },
        onMessage: (received) => {
          if (socketRun === this.socketRun) this.receive(received);
          else traffic.bump('staleMessages');
        },
        onClose: (code, reason) => {
          if (socketRun === this.socketRun) this.closed(code, reason);
          else traffic.bump('staleCloses');
        },
      },
    );
  }

  private receive(received: Received): void {
    if (received.kind === 'unreadable') {
      this.unreadable(received.reason, received.table);
      return;
    }
    recordNotice();
    if (logEnabled('debug')) {
      traffic.bump(
        received.message.type === 'change'
          ? `change.${received.message.table}`
          : `notice.${received.message.type}`,
      );
    }
    this.handle(received.message);
  }

  private unreadable(reason: string, table: string | null): void {
    if (table !== null && this.outdated.has(`tables.${table}`)) {
      log.debug('live.outdated_change_skipped', { table });
      return;
    }
    if (table === null) {
      log.warn('live.notice_ignored', { reason });
      return;
    }
    log.warn('live.unreadable', { reason, table });
    this.resnapshot(`The server sent something this app cannot read: ${reason}`);
  }

  private subscriptionTables(): LiveTable[] {
    this.sentTables = LIVE_TABLES.filter((table) => !this.unsupportedTables.has(table));
    return [...this.sentTables];
  }

  private dropUnsupported(reason: string): void {
    const rejected = rejectedTables(this.sentTables, reason);
    if (rejected.length === 0) return;
    log.warn('live.tables_unsupported', { tables: rejected });
    this.unsupportedTables = new Set([...this.unsupportedTables, ...rejected]);
  }

  private handle(message: LiveMessage): void {
    if (message.type === 'refused') this.dropUnsupported(message.error.message);
    if (message.type === 'change') {
      this.change(message);
      return;
    }
    if (message.type === 'profile_changed') {
      log.info('live.profile_changed', { profileId: message.profileId });
      this.enter('buffering');
      this.buffer = [];
      this.activityBuffer = [];
      this.store.setSync({ status: 'loading', problem: null });
      this.hooks.onProfileChanged();
      background(this.loadSnapshot(), 'snapshot.load_failed');
      return;
    }
    if (message.type === 'subscribed') {
      log.info('live.subscribed', { tables: message.tables.length, seq: message.seq });
      background(this.loadSnapshot(), 'snapshot.load_failed');
      return;
    }
    if (this.hooks.onNotice?.(message, this.phase !== 'closed') === true) {
      traffic.bump('noticeHandledByHook');
      return;
    }
    if (
      this.phase === 'buffering' &&
      (message.type === 'chat_activity' || message.type === 'chat_stream')
    ) {
      this.activityBuffer.push(message);
      traffic.bump('activityBuffered');
      return;
    }
    noticeTo(this.store, message.type, message);
  }

  private change(change: LiveChange): void {
    if (this.phase === 'buffering') {
      this.buffer.push(change);
      traffic.bump('changeBuffered');
      return;
    }
    const seq = this.store.get().sync.seq;
    if (seq !== null && change.seq <= seq) {
      traffic.bump('changeDuplicate');
      return;
    }
    this.batch.push(change);
    if (this.batch.length === 1) {
      queueMicrotask(() => {
        this.flush();
      });
    }
  }

  private flush(): void {
    const changes = this.phase === 'live' ? this.batch : [];
    if (changes.length !== this.batch.length) traffic.bump('batchDropped');
    this.batch = [];
    traffic.bump('batchesApplied');
    traffic.bump('changesApplied', changes.length);
    this.applyAll(changes);
  }

  private applyAll(changes: readonly LiveChange[]): void {
    try {
      this.store.apply(changes);
    } catch (error) {
      if (!(error instanceof UnreadableChangeError)) throw error;
      log.warn('live.change_unreadable', { table: error.table, reason: error.reason });
      this.resnapshot(error.message);
      return;
    }
    this.hooks.onChanges(changes);
  }

  private resnapshot(problem: string | null): void {
    log.warn('live.resnapshot', { ...this.ids(), reasonLength: problem?.length ?? 0 });
    this.enter('buffering');
    this.buffer = [];
    this.activityBuffer = [];
    this.store.setSync({ status: 'interrupted', problem });
    background(this.loadSnapshot(), 'snapshot.load_failed');
  }

  private async loadSnapshot(): Promise<void> {
    this.snapshotRun += 1;
    const run = this.snapshotRun;
    const begun = Date.now();
    log.info('live.snapshot_started', this.ids());
    this.deadline.rearm(LINK_DEADLINE_MS);
    this.store.setSync({ status: this.store.get().loaded ? 'interrupted' : 'loading' });
    try {
      const read = await api().callTables(E.readSnapshot, SNAPSHOT_REQUEST, SNAPSHOT_ROOTS);
      const snapshot = read.data;
      if (run !== this.snapshotRun || this.phase === 'closed') {
        log.info('live.snapshot_discarded', { ...this.ids(), run, durationMs: Date.now() - begun });
        return;
      }
      const readMs = Date.now() - begun;
      this.store.replace(snapshot);
      this.snapshotCommands(snapshot.tables.commands);
      this.outdated = new Set(read.skipped);
      const replay = this.buffer.filter((change) => change.seq > snapshot.seq);
      this.buffer = [];
      this.enter('live');
      this.deadline.cancel();
      this.applyAll(replay);
      this.replayActivity();
      this.attempt = 0;
      this.store.setSync({ status: 'live', problem: null, outdated: read.skipped });
      this.hooks.onSynchronized?.(replay);
      log.info('live.ready', {
        ...this.ids(),
        seq: snapshot.seq,
        replayed: replay.length,
        skippedTables: read.skipped.length,
        durationMs: readMs,
      });
      loadOwnerConsents(
        this.store,
        snapshot.session.client.role === 'owner',
        () => run === this.snapshotRun && this.phase !== 'closed',
      );
    } catch (error) {
      if (run !== this.snapshotRun) return;
      log.error('live.snapshot_failed', error, { ...this.ids(), durationMs: Date.now() - begun });
      this.store.setSync({
        status: 'interrupted',
        problem: rawErrorText(error),
      });
      this.stopSocket?.();
      this.closed(0, 'snapshot failed');
    }
  }

  private replayActivity(): void {
    for (const notice of this.activityBuffer) noticeTo(this.store, notice.type, notice);
    this.activityBuffer = [];
  }

  private timedOut(): void {
    log.warn('live.link_timed_out', this.ids());
    this.stopSocket?.();
    this.store.setSync({ status: 'interrupted', problem: 'The server did not answer in time' });
    this.closed(0, 'link timed out');
  }

  private closed(code: number, reason: string): void {
    this.deadline.cancel();
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    this.stopSocket = null;
    detachWatches();
    this.enter('closed');
    this.snapshotRun += 1;
    this.store.setSync({ status: 'interrupted' });
    log.info('live.closed', { code, reason });
    if (code === TOKEN_WITHDRAWN) {
      connectionRefused(this.connection);
      return;
    }
    const wait = backoffOf(this.attempt);
    log.info('live.retry_scheduled', { ...this.ids(), inMs: wait, code });
    this.retry = setTimeout(() => {
      this.open();
    }, wait);
    this.attempt += 1;
  }
}
