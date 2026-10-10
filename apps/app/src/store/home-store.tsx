import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { EVENT_KIND_LABELS, isUrgent, type LiveChange } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ServerConnection } from '../api/transport';
import { appPlatform, desktopBridge } from '../design/platform';
import { applyToWindows, refreshAllWindows } from '../queries/live-invalidations';
import { CommandLedger } from './command-ledger';
import { EntityStore } from './entity-store';
import { LiveSync } from './live-sync';
import { persistSnapshots, restoreSnapshot } from './persistence';
import { StoreProvider, type StoreRuntime } from './store-context';

const log = new Logger('app.store');

function followAppState(sync: LiveSync, client: QueryClient): () => void {
  if (appPlatform() !== 'android') {
    return (): void => undefined;
  }
  const apply = (state: string): void => {
    if (state === 'background') {
      sync.suspend();
    } else if (state === 'active' && sync.resume()) {
      refreshAllWindows(client);
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

function runtimeOf(connection: ServerConnection, client: QueryClient): Runtime {
  const store = new EntityStore();
  const ledger = new CommandLedger(store);
  const sync = new LiveSync(connection, store, {
    onChanges: (changes): void => {
      ledger.noteChanges(changes);
      applyToWindows(client, changes);
      notifyDesktop(store, changes);
    },
    onProfileChanged: (): void => {
      client.removeQueries();
    },
  });
  const start = (): (() => void) => {
    restoreSnapshot(connection.url, store).catch((error: unknown) => {
      log.warn('snapshot.restore_failed', { reason: String(error) });
    });
    sync.start();
    const following = followAppState(sync, client);
    const persisting = persistSnapshots(connection.url, store);
    const online = onlineManager.subscribe((isOnline) => {
      if (isOnline) {
        sync.online();
      }
    });
    return (): void => {
      online();
      following();
      persisting();
      sync.stop();
      ledger.stop();
    };
  };
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
  const [runtime] = useState(() => runtimeOf(connection, client));
  useEffect(() => runtime.start(), [runtime]);
  return <StoreProvider runtime={runtime}>{children}</StoreProvider>;
}
