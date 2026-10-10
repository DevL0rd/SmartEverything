import {
  API_ENDPOINTS as E,
  LIVE_TABLES,
  type LiveChange,
  type LiveMessage,
  type LiveStream,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api, connectionRefused, type ServerConnection } from '../api/transport';
import { withFrame, withSnapshot } from './chat-turns';
import { deliverWatchActionRequest } from './watch-action-requests';
import { deliverAiSpeech } from './ai-speech-requests';
import { appPlatform } from '../design/platform';
import type { EntityStore } from './entity-store';
import { notify } from '../components/toast-store';
import { UnreadableChangeError } from './live-reducers';
import { TOKEN_WITHDRAWN, backoffOf, openLiveSocket, type Received } from './live-socket';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.live');

const SNAPSHOT_ROOTS: readonly string[] = ['tables', 'owner'];

export interface LiveSyncHooks {
  readonly onChanges: (changes: readonly LiveChange[]) => void;
  readonly onProfileChanged: () => void;
}

type Phase = 'closed' | 'buffering' | 'live';

const AWAITING_HUB_DEPLOY: ReadonlySet<string> = new Set<string>([]);

export function awaitingHubDeploy(name: string): boolean {
  return AWAITING_HUB_DEPLOY.has(name);
}

function deployed<T extends string>(names: readonly T[]): T[] {
  return names.filter((name) => !AWAITING_HUB_DEPLOY.has(name));
}

function platformStreams(): readonly LiveStream[] {
  const platform = appPlatform();
  if (platform === 'desktop') {
    return ['service_log', 'talk'];
  }
  return platform === 'android' ? ['watch_actions', 'talk'] : ['talk'];
}

type Notice = Exclude<LiveMessage, { type: 'change' | 'subscribed' | 'profile_changed' }>;

type NoticeMap = { readonly [K in Notice['type']]: Extract<Notice, { readonly type: K }> };

type NoticeHandler<K extends Notice['type']> = (store: EntityStore, message: NoticeMap[K]) => void;

function setHub(store: EntityStore, message: NoticeMap['ready' | 'presence']): void {
  store.update((state) => ({ ...state, hub: message.hub }));
}

const NOTICES: { readonly [K in Notice['type']]: NoticeHandler<K> } = {
  ready: setHub,
  presence: setHub,
  firewall: (store, message) => {
    store.update((state) => ({ ...state, firewall: message.firewall }));
  },
  refused: (store, message) => {
    log.warn('live.refused', { code: message.error.code, reason: message.error.message });
    store.setSync({ status: 'refused', problem: message.error.message });
  },
  mcp_consent: (store, message) => {
    store.update((state) => ({
      ...state,
      consentRequests: [
        ...state.consentRequests.filter((request) => request.id !== message.request.id),
        message.request,
      ],
    }));
  },
  mcp_consent_closed: (store, message) => {
    store.update((state) => ({
      ...state,
      consentRequests: state.consentRequests.filter((request) => request.id !== message.id),
    }));
  },
  smartthings_webhook: (store, message) => {
    store.update((state) => ({ ...state, smartthingsWebhook: message.webhook }));
  },
  service_log: (store, message) => {
    store.appendLog(message.lines);
  },
  talk_floors: (store, message) => {
    store.update((state) => ({
      ...state,
      talkPresence: { floors: message.floors, online: message.online },
    }));
  },
  assistant_status: (store, message) => {
    store.update((state) => ({ ...state, assistant: message.status }));
  },
  chat_activity: (store, message) => {
    store.update((state) => ({ ...state, turns: withSnapshot(state.turns, message) }));
  },
  chat_stream: (store, message) => {
    store.update((state) => ({ ...state, turns: withFrame(state.turns, message) }));
  },
  ai_speech: (_store, message) => {
    log.info('live.ai_speech', { listeners: deliverAiSpeech(message) });
  },
  watch_action: (_store, message) => {
    const handlers = deliverWatchActionRequest(message);
    log.info('live.watch_action', { action: message.action.type, handlers });
  },
};

function noticeTo<K extends Notice['type']>(
  store: EntityStore,
  type: K,
  message: NoticeMap[K],
): void {
  const handle: NoticeHandler<K> = NOTICES[type];
  handle(store, message);
}

export class LiveSync {
  private stopSocket: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private phase: Phase = 'closed';
  private buffer: LiveChange[] = [];
  private batch: LiveChange[] = [];
  private snapshotRun = 0;
  private outdated: ReadonlySet<string> = new Set();

  constructor(
    private readonly connection: ServerConnection,
    private readonly store: EntityStore,
    private readonly hooks: LiveSyncHooks,
  ) {}

  start(): void {
    this.open();
  }

  stop(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
    this.phase = 'closed';
    this.stopSocket?.();
    this.stopSocket = null;
  }

  online(): void {
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.open();
    }
  }

  private open(): void {
    this.retry = null;
    this.phase = 'buffering';
    this.buffer = [];
    this.store.setSync({ status: this.store.get().loaded ? 'interrupted' : 'connecting' });
    this.stopSocket = openLiveSocket(
      {
        url: this.connection.url,
        token: this.connection.token,
        subscribe: {
          type: 'subscribe',
          tables: deployed(LIVE_TABLES),
          streams: deployed(platformStreams()),
        },
      },
      {
        onOpen: () => {
          log.debug('live.opened', { attempt: this.attempt });
        },
        onMessage: (received) => {
          this.receive(received);
        },
        onClose: (code, reason) => {
          this.closed(code, reason);
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
    log.warn('live.unreadable', { reason, table: table ?? 'none' });
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
      this.hooks.onProfileChanged();
      void this.loadSnapshot();
      return;
    }
    if (message.type === 'subscribed') {
      log.debug('live.subscribed', { tables: message.tables.length, seq: message.seq });
      void this.loadSnapshot();
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
    if (seq !== null && change.seq <= seq) {
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
    const changes = this.batch;
    this.batch = [];
    this.applyAll(changes);
  }

  private applyAll(changes: readonly LiveChange[]): void {
    try {
      this.store.apply(changes);
    } catch (error) {
      if (!(error instanceof UnreadableChangeError)) {
        throw error;
      }
      log.warn('live.change_unreadable', { table: error.table, reason: error.reason });
      this.resnapshot(error.message);
      return;
    }
    this.hooks.onChanges(changes);
  }

  private resnapshot(problem: string): void {
    this.phase = 'buffering';
    this.buffer = [];
    this.store.setSync({ status: 'interrupted', problem });
    void this.loadSnapshot();
  }

  private async loadSnapshot(): Promise<void> {
    this.snapshotRun += 1;
    const run = this.snapshotRun;
    this.store.setSync({ status: this.store.get().loaded ? 'interrupted' : 'loading' });
    try {
      const read = await api().callTables(
        E.readSnapshot,
        { query: { nutrition: true, watch: true, weather: true, talk: true, assistant: true } },
        SNAPSHOT_ROOTS,
      );
      const snapshot = read.data;
      if (run !== this.snapshotRun || this.phase === 'closed') {
        return;
      }
      this.store.replace(snapshot);
      this.outdated = new Set(read.skipped);
      const replay = this.buffer.filter((change) => change.seq > snapshot.seq);
      this.buffer = [];
      this.phase = 'live';
      this.applyAll(replay);
      this.attempt = 0;
      this.store.setSync({ status: 'live', problem: null, outdated: read.skipped });
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
    const requests = await api().call(E.listMcpConsents, {});
    this.store.update((state) => ({ ...state, consentRequests: requests }));
  }

  private closed(code: number, reason: string): void {
    this.stopSocket = null;
    this.phase = 'closed';
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
