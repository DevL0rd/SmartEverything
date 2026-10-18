import { refreshTranscriptReaders, transcriptCameraChanges } from '../queries/transcript-notices';
import { cancelHarnessQueries, refreshHarness } from '../queries/harness-notices';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { EVENT_KIND_LABELS, isUrgent, type LiveChange } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ServerConnection } from '../api/transport';
import { routeFor } from '../api/connection/active-route';
import { errorFields } from '../design/log-tally';
import { appPlatform, desktopBridge } from '../design/platform';
import {
  applyToWindows,
  refreshAllWindows,
  refreshDeviceEffects,
} from '../queries/live-invalidations';
import { CommandLedger } from './command-ledger';
import { EntityStore } from './entity-store';
import { FEATURE_NOTICES } from './live-feature-notices';
import { LiveSync } from './live-sync';
import { noticeRouter } from './notice-registry';
import { followPageVisibility } from './page-visibility';
import { persistSnapshots, restoreSnapshot } from './persistence';
import { StoreProvider } from './store-context';
import type { StoreRuntime } from './store-runtime';
import {
  clearImageSession,
  clearUploads,
  forgetOlderMessages,
  IMAGE_QUERY_PREFIX,
  refreshImageOperations,
  reconcileImageMessages,
} from '../features/assistant';

const log = new Logger('app.store');

function clearAssistantSession(): void {
  clearImageSession();
  clearUploads();
  forgetOlderMessages();
}

function followAppState(sync: LiveSync, client: QueryClient): () => void {
  if (appPlatform() !== 'android') return followPageVisibility(sync);
  const apply = (state: string): void => {
    log.info('runtime.app_state', { appState: state });
    if (state === 'background') {
      sync.suspend();
    } else if (state === 'active') {
      if (sync.resume()) refreshAllWindows(client);
      else sync.refresh();
    }
  };
  apply(AppState.currentState);
  const subscription = AppState.addEventListener('change', apply);
  return (): void => {
    subscription.remove();
  };
}

function notifyDesktop(store: EntityStore, changes: readonly LiveChange[]): void {
  const bridge = desktopBridge();
  if (bridge === null) {
    return;
  }
  for (const change of changes) {
    if (
      change.table === 'events' &&
      change.operation === 'INSERT' &&
      change.record !== null &&
      isUrgent(change.record.kind)
    ) {
      const device =
        change.record.device_id === null
          ? undefined
          : store.get().tables.devices.byId[change.record.device_id];
      bridge
        .notify({
          title: EVENT_KIND_LABELS[change.record.kind],
          body: device?.label ?? 'Your home',
        })
        .catch((error: unknown) => {
          log.error('desktop.notify_failed', error);
        });
    }
  }
}

interface Runtime extends StoreRuntime {
  readonly start: () => () => void;
}

function synchronized(client: QueryClient, replayed: readonly LiveChange[]): void {
  log.info('runtime.synchronized', { replayed: replayed.length });
  if (!replayed.some((change) => change.table === 'device_effect_targets')) {
    refreshDeviceEffects(client);
  }
  refreshHarness(client);
  refreshTranscriptReaders(client);
  refreshImageOperations(client);
}

function runtimeOf(connection: ServerConnection, client: QueryClient): Runtime {
  const store = new EntityStore();
  const ledger = new CommandLedger(store);
  const sync = new LiveSync(connection, store, {
    onSnapshotCommands: ledger.noteSnapshot.bind(ledger),
    onChanges: (changes): void => {
      ledger.noteChanges(changes);
      applyToWindows(client, changes);
      transcriptCameraChanges(client, changes);
      reconcileImageMessages(client, changes);
      notifyDesktop(store, changes);
    },
    onNotice: noticeRouter(FEATURE_NOTICES, { client, store }),
    onProfileChanged: (): void => {
      log.info('runtime.profile_changed', { queries: client.getQueryCache().getAll().length });
      routeFor(connection).invalidate();
      clearAssistantSession();
      client.removeQueries();
    },
    onSynchronized: synchronized.bind(null, client),
  });
  const start = (): (() => void) => startRuntime({ connection, client, store, sync, ledger });
  return { store, ledger, start };
}

export function HomeStore({
  connection,
  children,
}: {
  readonly connection: ServerConnection;
  readonly children: ReactNode;
}): ReactNode {
  const client = useQueryClient();
  const [runtime] = useState(() => {
    log.info('runtime.created', { platform: appPlatform() });
    return runtimeOf(connection, client);
  });
  useEffect(() => runtime.start(), [runtime]);
  return <StoreProvider runtime={runtime}>{children}</StoreProvider>;
}

interface RuntimeStartup {
  readonly connection: ServerConnection;
  readonly client: QueryClient;
  readonly store: EntityStore;
  readonly sync: LiveSync;
  readonly ledger: CommandLedger;
}
function startRuntime(ports: RuntimeStartup): () => void {
  const { connection, client, store, sync, ledger } = ports;
  log.info('runtime.starting', { platform: appPlatform() });
  clearAssistantSession();
  client.removeQueries({ queryKey: IMAGE_QUERY_PREFIX });
  const snapshotScope = `${connection.url} ${connection.token}`;
  restoreSnapshot(snapshotScope, store).catch((error: unknown) => {
    log.warn('snapshot.restore_failed', errorFields(error));
  });
  sync.start();
  const following = followAppState(sync, client);
  const persisting = persistSnapshots(snapshotScope, store);
  const online = onlineManager.subscribe((isOnline) => {
    log.info('runtime.online_changed', { online: isOnline });
    if (isOnline) {
      sync.online();
    }
  });
  return (): void => {
    log.info('runtime.stopping');
    online();
    following();
    persisting();
    sync.stop();
    clearAssistantSession();
    client.removeQueries({ queryKey: IMAGE_QUERY_PREFIX });
    ledger.stop();
    cancelHarnessQueries(client);
  };
}
