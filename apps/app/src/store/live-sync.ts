import {
  API_ENDPOINTS as E,
  AI_PREVIEW_CAPABILITY,
  AI_ENGINE_CAPABILITY,
  AI_ENGINE_CAPABILITY_V2,
  AI_HARNESS_CAPABILITY,
  HARNESS_CONFIGURATION_NOTICE_CAPABILITY,
  LIVE_TABLES,
  type LiveChange,
  type LiveMessage,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api, connectionRefused, type ServerConnection } from '../api/transport';
import { noticeTo } from './live-notices';
import { routeFeatureNotice } from './live-feature-notices';
import { platformStreams } from './live-streams';
import type { EntityStore } from './entity-store';
import { notify } from '../components/toast-store';
import { UnreadableChangeError } from './live-reducers';
import { TOKEN_WITHDRAWN, backoffOf, openLiveSocket, type Received } from './live-socket';
import {
  clearServerCapabilities,
  serverSupportsComputerAi,
  serverSupportsComputerAiV2,
  serverSupportsAiHarness,
} from '../api/connection/server-capabilities';
import { rawErrorText } from '../format/errors';
import type { LiveSyncHooks } from './live-sync-hooks';
export type { LiveSyncHooks } from './live-sync-hooks';
import { routeFor } from '../api/connection/active-route';
import { followLiveRouteReadiness } from './live-route-readiness';
import { deployed } from './live-deployment';
export { awaitingHubDeploy } from './live-deployment';

const log = new Logger('app.live');
const SNAPSHOT_ROOTS: readonly string[] = ['tables', 'owner'];
export const LINK_DEADLINE_MS = 20_000;
type Phase = 'closed' | 'buffering' | 'live';
type ActivityNotice = Extract<LiveMessage, { type: 'chat_activity' | 'chat_stream' }>;

export class LiveSync {
  private retryRoute: (() => boolean) | null = null;
  private stopRoute: (() => void) | null = null;
  private socketRun = 0;
  private stopSocket: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private phase: Phase = 'closed';
  private buffer: LiveChange[] = [];
  private activityBuffer: ActivityNotice[] = [];
  private batch: LiveChange[] = [];
  private snapshotRun = 0;
  private outdated: ReadonlySet<string> = new Set();
  private suspended = false;
  private computerAiAdvertised = false;
  private computerAiV2Advertised = false;
  private harnessAdvertised = false;

  constructor(
    private readonly connection: ServerConnection,
    private readonly store: EntityStore,
    private readonly hooks: LiveSyncHooks,
  ) {}

  start(): void {
    const manager = routeFor(this.connection);
    let generation = manager.state.get().generation;
    this.stopRoute = manager.state.subscribe(() => {
      const next = manager.state.get().generation;
      if (next === generation || this.suspended || !manager.running) return;
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
        this.open();
      },
      failed: (error): void => {
        log.error('live.route_failed', error);
        this.store.setSync({ status: 'interrupted', problem: rawErrorText(error) });
      },
    });
  }

  stop(): void {
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
    this.clearDeadline();
    this.phase = 'closed';
    this.snapshotRun += 1;
    this.stopSocket?.();
    this.stopSocket = null;
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
    if (!this.suspended && this.retryRoute?.() === true) return;
    if (!this.suspended && this.retry !== null) {
      clearTimeout(this.retry);
      this.open();
    }
  }

  refresh(): void {
    if (this.suspended || this.phase !== 'live') return;
    this.resnapshot(this.store.get().sync.problem);
  }

  private open(): void {
    this.socketRun += 1;
    const socketRun = this.socketRun;
    this.retry = null;
    this.phase = 'buffering';
    this.buffer = [];
    this.activityBuffer = [];
    this.store.setSync({ status: this.store.get().loaded ? 'interrupted' : 'connecting' });
    this.armDeadline();
    this.computerAiAdvertised = serverSupportsComputerAi(this.connection.url);
    this.computerAiV2Advertised = serverSupportsComputerAiV2(this.connection.url);
    this.harnessAdvertised = serverSupportsAiHarness(this.connection.url);
    this.stopSocket = openLiveSocket(
      {
        url: this.connection.url,
        token: this.connection.token,
        subscribe: {
          type: 'subscribe',
          tables: deployed(LIVE_TABLES),
          streams: deployed(platformStreams()),
          capabilities: [
            ...(this.computerAiAdvertised ? [AI_ENGINE_CAPABILITY] : []),
            ...(this.computerAiV2Advertised ? [AI_ENGINE_CAPABILITY_V2] : []),
            ...(this.harnessAdvertised
              ? [
                  AI_HARNESS_CAPABILITY,
                  HARNESS_CONFIGURATION_NOTICE_CAPABILITY,
                  AI_PREVIEW_CAPABILITY,
                ]
              : []),
          ],
        },
      },
      {
        onOpen: () => {
          log.debug('live.opened', { attempt: this.attempt });
        },
        onMessage: (received) => {
          if (socketRun === this.socketRun) this.receive(received);
        },
        onClose: (code, reason) => {
          if (socketRun === this.socketRun) this.closed(code, reason);
        },
      },
    );
  }

  private receive(received: Received): void {
    if (received.kind === 'unreadable') {
      this.unreadable(received.reason, received.table);
      return;
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

  private handle(message: LiveMessage): void {
    if (message.type === 'change') {
      this.change(message);
      return;
    }
    if (message.type === 'profile_changed') {
      log.info('live.profile_changed', { profileId: message.profileId });
      this.phase = 'buffering';
      this.buffer = [];
      this.activityBuffer = [];
      this.store.setSync({ status: 'loading', problem: null });
      this.hooks.onProfileChanged();
      void this.loadSnapshot();
      return;
    }
    if (message.type === 'subscribed') {
      log.debug('live.subscribed', { tables: message.tables.length, seq: message.seq });
      void this.loadSnapshot();
      return;
    }
    if (routeFeatureNotice(this.hooks, message, this.phase !== 'closed')) return;
    if (
      this.phase === 'buffering' &&
      (message.type === 'chat_activity' || message.type === 'chat_stream')
    ) {
      this.activityBuffer.push(message);
      return;
    }
    noticeTo(this.store, message.type, message);
  }

  private change(change: LiveChange): void {
    if (this.phase === 'buffering') {
      this.buffer.push(change);
      return;
    }
    const seq = this.store.get().sync.seq;
    if (seq !== null && change.seq <= seq) return;
    this.batch.push(change);
    if (this.batch.length === 1) {
      queueMicrotask(() => {
        this.flush();
      });
    }
  }

  private flush(): void {
    const changes = this.phase === 'live' ? this.batch : [];
    this.batch = [];
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
    this.phase = 'buffering';
    this.buffer = [];
    this.activityBuffer = [];
    this.store.setSync({ status: 'interrupted', problem });
    void this.loadSnapshot();
  }

  private upgradeComputerAi(): boolean {
    const supported = serverSupportsComputerAi(this.connection.url);
    const v2 = serverSupportsComputerAiV2(this.connection.url);
    const harness = serverSupportsAiHarness(this.connection.url);
    if (
      this.computerAiAdvertised === supported &&
      this.computerAiV2Advertised === v2 &&
      this.harnessAdvertised === harness
    )
      return false;
    this.stopSocket?.();
    this.open();
    return true;
  }

  private async loadSnapshot(): Promise<void> {
    this.snapshotRun += 1;
    const run = this.snapshotRun;
    this.armDeadline();
    this.store.setSync({ status: this.store.get().loaded ? 'interrupted' : 'loading' });
    try {
      const read = await api().callTables(
        E.readSnapshot,
        { query: { nutrition: true, watch: true, weather: true, talk: true, assistant: true } },
        SNAPSHOT_ROOTS,
      );
      const snapshot = read.data;
      if (run !== this.snapshotRun || this.phase === 'closed') return;
      if (this.upgradeComputerAi()) return;
      this.store.replace(snapshot);
      this.outdated = new Set(read.skipped);
      const replay = this.buffer.filter((change) => change.seq > snapshot.seq);
      this.buffer = [];
      this.phase = 'live';
      this.clearDeadline();
      this.applyAll(replay);
      this.replayActivity();
      this.attempt = 0;
      this.store.setSync({ status: 'live', problem: null, outdated: read.skipped });
      this.hooks.onSynchronized?.();
      log.info('live.ready', { seq: snapshot.seq, replayed: replay.length });
      if (snapshot.session.client.role === 'owner') {
        this.loadConsents().catch((error: unknown) => {
          log.error('live.consents_failed', error);
          notify({
            message: 'Waiting assistant requests could not be read',
            error,
            tone: 'critical',
          });
        });
      }
    } catch (error) {
      if (run !== this.snapshotRun) return;
      log.error('live.snapshot_failed', error);
      this.store.setSync({
        status: 'interrupted',
        problem: rawErrorText(error),
      });
      this.stopSocket?.();
      this.closed(0, 'snapshot failed');
    }
  }

  private async loadConsents(): Promise<void> {
    const run = this.snapshotRun;
    const requests = await api().call(E.listMcpConsents, {});
    if (run === this.snapshotRun && this.phase !== 'closed')
      this.store.update((state) => ({ ...state, consentRequests: requests }));
  }

  private replayActivity(): void {
    for (const notice of this.activityBuffer) noticeTo(this.store, notice.type, notice);
    this.activityBuffer = [];
  }

  private armDeadline(): void {
    this.clearDeadline();
    this.deadline = setTimeout(() => {
      this.deadline = null;
      this.timedOut();
    }, LINK_DEADLINE_MS);
  }

  private clearDeadline(): void {
    if (this.deadline !== null) {
      clearTimeout(this.deadline);
      this.deadline = null;
    }
  }

  private timedOut(): void {
    log.warn('live.link_timed_out', { attempt: this.attempt });
    this.stopSocket?.();
    this.store.setSync({ status: 'interrupted', problem: 'The server did not answer in time' });
    this.closed(0, 'link timed out');
  }

  private closed(code: number, reason: string): void {
    clearServerCapabilities(this.connection.url);
    this.clearDeadline();
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    this.stopSocket = null;
    this.phase = 'closed';
    this.snapshotRun += 1;
    this.store.setSync({ status: 'interrupted' });
    log.info('live.closed', { code, reason });
    if (code === TOKEN_WITHDRAWN) {
      connectionRefused(this.connection);
      return;
    }
    this.retry = setTimeout(() => {
      this.open();
    }, backoffOf(this.attempt));
    this.attempt += 1;
  }
}
