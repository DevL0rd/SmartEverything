import type { AssistantMessageRow } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { connectionState } from '../../../api/connection/connection';
import type { ServerConnection } from '../../../api/connection/storage';
import { ServerUnreachableError, UnreadableAnswerError } from '../../../api/connection/client';
import { HubRouteUnavailableError, StaleHubRouteError } from '../../../api/connection/route-policy';
import { notify } from '../../../components/toast-store';
import { ValueStore, usePausable, useSelected } from '../../../design/external-store';
import { friendlyError } from '../../../format/errors';
import type { EntityStore } from '../../../store/entity-store';
import type { StoreState } from '../../../store/state';
import { oldestOf } from './thread';

const PAGE = 50;
const log = new Logger('app.assistant');

interface History {
  readonly rows: readonly AssistantMessageRow[];
  readonly loading: boolean;
  readonly complete: boolean;
  readonly before: string | null;
}

export type OlderLoader = (before: string) => Promise<readonly AssistantMessageRow[]>;

const EMPTY: History = { rows: [], loading: false, complete: false, before: null };

const histories = new ValueStore<Readonly<Record<string, History>>>({});
export const historyRevision = new ValueStore(0);

class HistoryOwner {
  recovery = 0;
  pending: { readonly before: string; readonly recovery: number } | null = null;

  constructor(
    readonly current: () => boolean,
    readonly live: () => boolean,
    readonly load: OlderLoader,
    readonly stop: () => void,
  ) {}

  recovered(): void {
    this.recovery += 1;
  }

  begin(): number {
    this.pending = null;
    return this.recovery;
  }

  wait(before: string, recovery: number): void {
    this.pending = { before, recovery };
  }
}

const owners = new Map<string, HistoryOwner>();

const sessionKeys = new WeakMap<object, string>();

export function historySessionKey(state: StoreState): string | null {
  const client = state.session?.client;
  if (client === undefined || state.sync.status === 'loading') return null;
  const known = sessionKeys.get(client);
  if (known !== undefined) return known;
  const key = JSON.stringify([client.id, client.profile_id, client.role]);
  sessionKeys.set(client, key);
  return key;
}

export function useOlderRows(key: string): readonly AssistantMessageRow[] {
  return usePausable(histories.subscribe, () => (histories.get()[key] ?? EMPTY).rows);
}

export function useOlderComplete(key: string): boolean {
  return useSelected(histories, (all) => (all[key] ?? EMPTY).complete);
}

export function useOlderLoading(key: string): boolean {
  return useSelected(histories, (all) => (all[key] ?? EMPTY).loading);
}

export function forgetOlderMessages(): void {
  log.info('history.forgotten', { chats: owners.size });
  for (const owner of owners.values()) owner.stop();
  owners.clear();
  histories.set({});
  historyRevision.update((revision) => revision + 1);
}

function release(key: string, owner: HistoryOwner, remove: boolean): void {
  log.debug('history.released', () => ({
    chatId: key,
    remove,
    tracked: owners.get(key) === owner,
  }));
  owner.stop();
  if (owners.get(key) !== owner) return;
  owners.delete(key);
  histories.update((all) => {
    const { [key]: history, ...kept } = all;
    return remove || history === undefined
      ? kept
      : { ...kept, [key]: { ...history, loading: false } };
  });
}

function connectionCurrent(connection: ServerConnection): boolean {
  const state = connectionState.get();
  return state.status === 'paired' && state.connection === connection;
}

export function ownOlderMessages(key: string, load: OlderLoader, store: EntityStore): () => void {
  const connection = connectionState.get();
  const session = historySessionKey(store.get());
  if (connection.status !== 'paired' || session === null) return () => undefined;
  const previous = owners.get(key);
  if (previous !== undefined) release(key, previous, false);
  log.debug('history.owned', { chatId: key, replaced: previous !== undefined });
  let live = store.get().sync.status === 'live';
  const owner = new HistoryOwner(
    (): boolean =>
      owners.get(key) === owner &&
      connectionCurrent(connection.connection) &&
      historySessionKey(store.get()) === session &&
      store.get().tables.ai_chats.byId[key] !== undefined,
    (): boolean => store.get().sync.status === 'live',
    load,
    (): void => {
      stopStore();
      stopConnection();
    },
  );
  owners.set(key, owner);
  const stopStore = store.subscribeSlices(['session', 'sync', 'tables.ai_chats'], () => {
    if (!owner.current()) {
      release(key, owner, true);
      return;
    }
    const nextLive = store.get().sync.status === 'live';
    if (nextLive && !live) owner.recovered();
    live = nextLive;
    retryOlderMessages(key, owner);
  });
  const stopConnection = connectionState.subscribe(() => {
    if (!owner.current()) release(key, owner, true);
  });
  resumeOlderMessages(key, owner, live);
  return (): void => {
    release(key, owner, false);
  };
}

function resumeOlderMessages(key: string, owner: HistoryOwner, live: boolean): void {
  const before = histories.get()[key]?.before;
  if (before === undefined || before === null || !owner.current()) return;
  if (live) background(loadPage(key, owner, before, owner.load), 'page.load_failed');
  else owner.wait(before, owner.recovery);
}

function patch(key: string, change: (history: History) => History): void {
  histories.update((all) => ({ ...all, [key]: change(all[key] ?? EMPTY) }));
}

export function mergedRows(
  live: readonly AssistantMessageRow[],
  older: readonly AssistantMessageRow[],
): readonly AssistantMessageRow[] {
  if (older.length === 0) {
    return live;
  }
  const known = new Set(live.map((row) => row.id));
  return [...live, ...older.filter((row) => !known.has(row.id))];
}

export async function loadOlderMessages(
  key: string,
  shown: readonly AssistantMessageRow[],
  load: OlderLoader,
): Promise<void> {
  const owner = owners.get(key);
  if (owner?.current() !== true) {
    log.debug('history.load_skipped', { chatId: key, reason: 'not-current' });
    return;
  }
  const current = histories.get()[key] ?? EMPTY;
  if (current.loading || current.complete || owner.pending !== null) {
    log.trace('history.load_skipped', {
      chatId: key,
      loading: current.loading,
      complete: current.complete,
      waiting: owner.pending !== null,
    });
    return;
  }
  const before = current.before ?? oldestOf(shown) ?? new Date().toISOString();
  await loadPage(key, owner, before, load);
}

function retryOlderMessages(key: string, owner: HistoryOwner): void {
  const pending = owner.pending;
  if (pending === null || pending.recovery === owner.recovery || !owner.current() || !owner.live())
    return;
  background(loadPage(key, owner, pending.before, owner.load), 'page.load_failed');
}

function transportFailure(error: unknown): boolean {
  return (
    error instanceof ServerUnreachableError ||
    error instanceof HubRouteUnavailableError ||
    error instanceof StaleHubRouteError
  );
}

function historyFailure(error: unknown): void {
  const message =
    error instanceof UnreadableAnswerError
      ? 'Update the app to read older messages from this server.'
      : (friendlyError(error) ?? 'Older messages could not be loaded');
  notify({ message, error, tone: 'critical' });
}

function logPage(event: string, chatId: string, rows: number, startedAt: number): void {
  log.info(event, { chatId, rows, complete: rows < PAGE, durationMs: Date.now() - startedAt });
}

async function loadPage(
  key: string,
  owner: HistoryOwner,
  before: string,
  load: OlderLoader,
): Promise<void> {
  const recovery = owner.begin();
  patch(key, (history) => ({ ...history, loading: true, before }));
  const startedAt = Date.now();
  log.debug('history.page_loading', { chatId: key, before, recovery });
  try {
    const page = await load(before);
    if (!owner.current()) {
      logPage('history.page_discarded', key, page.length, startedAt);
      return;
    }
    logPage('history.page_loaded', key, page.length, startedAt);
    patch(key, (history) => ({
      rows: [...history.rows, ...page],
      loading: false,
      complete: page.length < PAGE,
      before: null,
    }));
  } catch (error) {
    log.error('history.load_failed', error, {
      chatId: key,
      before,
      transport: transportFailure(error),
      current: owner.current(),
      durationMs: Date.now() - startedAt,
    });
    if (!owner.current()) return;
    patch(key, (history) => ({ ...history, loading: false }));
    if (!transportFailure(error)) {
      historyFailure(error);
      return;
    }
    log.debug('history.page_waiting', { chatId: key, before, recovery });
    owner.wait(before, recovery);
    retryOlderMessages(key, owner);
  }
}
